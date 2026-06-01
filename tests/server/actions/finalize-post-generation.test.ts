import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/client', () => ({
  db: {
    contentRun: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    post: {
      count: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
    },
    batch: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    client: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/server/middleware/permissions', () => ({
  requireClientEditor: vi.fn(),
}))

vi.mock('@/server/repositories/contentRuns', () => ({
  findContentRunForOrg: vi.fn(),
  findMatchingBatchForRun: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { db } from '@/db/client'
import { requireClientEditor } from '@/server/middleware/permissions'
import {
  findContentRunForOrg,
  findMatchingBatchForRun,
} from '@/server/repositories/contentRuns'
import {
  finalizePostGenerationAction,
  findMatchingBatchForRunAction,
  deferFinalizeAction,
} from '@/server/actions/finalize-post-generation'

const mockCtx = {
  userId: 'user_clerk_123',
  orgId: 'org_1',
  role: 'account_manager' as const,
  plan: 'agency' as const,
  organizationDbId: 'cuid_org_1',
  userDbId: 'cuid_user_1',
  platformOwner: false,
  linkedClientId: null,
  permissionOverrides: null,
  roleDefaults: {},
}

const mockRun = {
  id: 'run_1',
  clientId: 'client_1',
  targetMonth: '2026-05',
  status: 'complete',
  posts: [{ id: 'post_1' }, { id: 'post_2' }, { id: 'post_3' }],
  client: { organizationId: 'cuid_org_1' },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireClientEditor).mockResolvedValue(mockCtx)
  // In-scope: run resolves to the actor's org.
  vi.mocked(findContentRunForOrg).mockResolvedValue(mockRun as never)
  // Default: no posts are attached yet (run not finalized).
  vi.mocked(db.post.findFirst).mockResolvedValue(null)
  // Default: any user-supplied batchId belongs to the run's client (so the
  // add/replace happy paths pass the new batch-scope check).
  vi.mocked(db.batch.findUnique).mockResolvedValue({ clientId: 'client_1' } as never)
  // Default: Client lookup for the snapshot returns a row with the flag
  // set to true. Per-test overrides flip it for the snapshot assertions
  // below.
  vi.mocked(db.client.findUnique).mockResolvedValue({
    name: 'Acme Co',
    clientReviewEnabled: true,
  } as never)
})

describe('finalizePostGenerationAction', () => {
  it("'replace' deletes existing batch posts then attaches new ones", async () => {
    const result = await finalizePostGenerationAction({
      choice: 'replace',
      runId: 'run_1',
      batchId: 'batch_existing',
    })

    expect(result).toEqual({ batchId: 'batch_existing' })

    // Existing posts in batch deleted (excluding the new ones, which have no batchId yet)
    expect(db.post.deleteMany).toHaveBeenCalledWith({
      where: {
        batchId: 'batch_existing',
        id: { notIn: ['post_1', 'post_2', 'post_3'] },
      },
    })

    // New posts attached to the batch
    expect(db.post.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['post_1', 'post_2', 'post_3'] } },
      data: { batchId: 'batch_existing' },
    })

    // Batch sub-state advanced to drafted
    expect(db.batch.update).toHaveBeenCalledWith({
      where: { id: 'batch_existing' },
      data: { currentSubState: 'drafted' },
    })
  })

  it("'new' creates a new batch with custom label and attaches new posts", async () => {
    vi.mocked(db.batch.findFirst).mockResolvedValue({
      currentHolder: 'user_existing',
      currentRole: 'designer',
    } as never)

    vi.mocked(db.batch.create).mockResolvedValue({
      id: 'batch_new',
    } as never)

    const result = await finalizePostGenerationAction({
      choice: 'new',
      runId: 'run_1',
      label: 'May 2026 (rerun)',
    })

    expect(result).toEqual({ batchId: 'batch_new' })

    // Batch created with the custom label and inheriting holder from the
    // existing batch, but currentRole is pinned to HOLDER_ROLE['copy']
    // (=am) regardless of what the previous batch's role was. See the
    // regression test below for the rationale.
    expect(db.batch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId: 'client_1',
        label: 'May 2026 (rerun)',
        currentStep: 'copy',
        currentSubState: 'drafted',
        currentHolder: 'user_existing',
        currentRole: 'am',
      }),
    })

    // New posts attached to the new batch
    expect(db.post.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['post_1', 'post_2', 'post_3'] } },
      data: { batchId: 'batch_new' },
    })

    // No sub-state update call for 'new' (it was already set 'drafted' on create)
    expect(db.batch.update).not.toHaveBeenCalled()
  })
})

describe('createBatchForRun currentRole pinning (Phase 2 item 8 regression)', () => {
  // The bug: createBatchForRun used to write
  //   currentRole: anyBatch?.currentRole ?? RelayRole.am
  // so a previous batch sitting at in_design (currentRole=designer) would
  // seed the new copy-step batch with currentRole=designer. BatchCard
  // reads currentRole directly while RelayTrack derives the role from
  // STEP_ROLE[currentStep], so the two surfaces showed different role
  // chips for the same batch. The fix pins currentRole to
  // HOLDER_ROLE['copy'] (=am) on every freshly-created batch.
  beforeEach(() => {
    vi.mocked(db.batch.create).mockResolvedValue({ id: 'batch_new' } as never)
  })

  it("pins currentRole to 'am' even when the previous batch was held by a designer", async () => {
    vi.mocked(db.batch.findFirst).mockResolvedValue({
      currentHolder: 'designer_user_1',
      currentRole: 'designer',
    } as never)

    await finalizePostGenerationAction({
      choice: 'new',
      runId: 'run_1',
      label: 'July 2026',
    })

    const createCall = vi.mocked(db.batch.create).mock.calls[0][0]
    expect(createCall.data.currentStep).toBe('copy')
    expect(createCall.data.currentRole).toBe('am')
  })

  it("pins currentRole to 'am' even when the previous batch was held by a client", async () => {
    vi.mocked(db.batch.findFirst).mockResolvedValue({
      currentHolder: 'client_user_1',
      currentRole: 'client',
    } as never)

    await finalizePostGenerationAction({
      choice: 'new',
      runId: 'run_1',
      label: 'Aug 2026',
    })

    const createCall = vi.mocked(db.batch.create).mock.calls[0][0]
    expect(createCall.data.currentStep).toBe('copy')
    expect(createCall.data.currentRole).toBe('am')
  })

  it("pins currentRole to 'am' when no previous batch exists", async () => {
    vi.mocked(db.batch.findFirst).mockResolvedValue(null)

    await finalizePostGenerationAction({
      choice: 'new',
      runId: 'run_1',
      label: 'First Batch 2026-06',
    })

    const createCall = vi.mocked(db.batch.create).mock.calls[0][0]
    expect(createCall.data.currentStep).toBe('copy')
    expect(createCall.data.currentRole).toBe('am')
  })
})

describe('findMatchingBatchForRunAction', () => {
  it('returns null when findMatchingBatchForRun returns null', async () => {
    vi.mocked(findMatchingBatchForRun).mockResolvedValue(null)

    const result = await findMatchingBatchForRunAction('run_1')

    expect(result).toBeNull()
  })

  it('returns batchId + label + postCount when a match is found', async () => {
    vi.mocked(findMatchingBatchForRun).mockResolvedValue({
      id: 'batch_existing',
      label: '2026-05',
      postCount: 12,
    })

    const result = await findMatchingBatchForRunAction('run_1')

    expect(result).toEqual({
      batchId: 'batch_existing',
      label: '2026-05',
      postCount: 12,
    })
  })
})

describe('finalizePostGenerationAction idempotency', () => {
  it('returns existing batchId when called against an already-finalized run', async () => {
    // Posts for this run are already attached to a batch (finalized by another tab).
    vi.mocked(db.post.findFirst).mockResolvedValue({ batchId: 'b1' } as never)

    const result = await finalizePostGenerationAction({
      choice: 'replace',
      runId: 'run_1',
      batchId: 'b1',
    })

    expect(result.batchId).toBe('b1')
    expect(result.alreadyFinalized).toBe(true)

    // The full choice-handling logic must NOT have run.
    expect(db.post.updateMany).not.toHaveBeenCalled()
    expect(db.post.deleteMany).not.toHaveBeenCalled()
    expect(db.batch.update).not.toHaveBeenCalled()
    expect(db.batch.create).not.toHaveBeenCalled()
  })
})

describe('finalizePostGenerationAction cross-tenant guards', () => {
  it('refuses when the runId belongs to a different organization', async () => {
    // The run lookup returns null for cross-org runs, matching findClientForUser.
    vi.mocked(findContentRunForOrg).mockResolvedValue(null)

    await expect(
      finalizePostGenerationAction({
        choice: 'replace',
        runId: 'run_in_other_org',
        batchId: 'victim_batch',
      }),
    ).rejects.toThrow(/run not found/i)

    // The dangerous deleteMany on the victim batch must NOT have fired.
    expect(db.post.deleteMany).not.toHaveBeenCalled()
    expect(db.post.updateMany).not.toHaveBeenCalled()
    expect(db.post.findFirst).not.toHaveBeenCalled()
  })

  it("'replace' refuses when the user-supplied batchId belongs to a different client", async () => {
    // Run is in scope, but the batchId points to a batch in a sibling client.
    // Even within the same org this is the wrong target; cross-client should
    // never be allowed because finalize is a per-client operation.
    vi.mocked(db.batch.findUnique).mockResolvedValue({
      clientId: 'different_client',
    } as never)

    await expect(
      finalizePostGenerationAction({
        choice: 'replace',
        runId: 'run_1',
        batchId: 'batch_in_other_client',
      }),
    ).rejects.toThrow(/batch not found/i)

    // The dangerous deleteMany must NOT have fired.
    expect(db.post.deleteMany).not.toHaveBeenCalled()
  })

})

describe('findMatchingBatchForRunAction cross-tenant guard', () => {
  it('returns null when the run is in a different organization', async () => {
    vi.mocked(findContentRunForOrg).mockResolvedValue(null)

    const result = await findMatchingBatchForRunAction('run_in_other_org')

    expect(result).toBeNull()
    // The underlying lookup must NOT have run, so cross-org batchId/label
    // can't leak through.
    expect(findMatchingBatchForRun).not.toHaveBeenCalled()
  })
})

describe('deferFinalizeAction cross-tenant guard', () => {
  it('refuses when the runId belongs to a different organization', async () => {
    vi.mocked(findContentRunForOrg).mockResolvedValue(null)

    await expect(deferFinalizeAction('run_in_other_org')).rejects.toThrow(
      /run not found/i,
    )

    // The autoFinalize write must NOT have happened on a foreign run.
    expect(db.contentRun.update).not.toHaveBeenCalled()
  })

  it('flips autoFinalize for in-scope runs', async () => {
    await deferFinalizeAction('run_1')

    expect(db.contentRun.update).toHaveBeenCalledWith({
      where: { id: 'run_1' },
      data: { autoFinalize: true },
    })
  })
})

describe('createBatchForRun, clientReviewEnabled snapshot via auto-new', () => {
  // 'auto-new' is the background path: the helper inside
  // finalize-post-generation.ts looks the Client up by id and snapshots
  // its clientReviewEnabled onto the new Batch. Exercise via the public
  // action so we can assert end-to-end through the service.
  beforeEach(() => {
    vi.mocked(db.batch.findFirst).mockResolvedValue(null)
    vi.mocked(db.batch.create).mockResolvedValue({ id: 'batch_auto' } as never)
  })

  it("'auto-new' snapshots clientReviewEnabled = true", async () => {
    vi.mocked(db.client.findUnique).mockResolvedValue({
      name: 'Acme Co',
      clientReviewEnabled: true,
    } as never)

    await finalizePostGenerationAction({ choice: 'auto-new', runId: 'run_1' })

    expect(db.batch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId: 'client_1',
        clientReviewEnabled: true,
      }),
    })
  })

  it("'auto-new' snapshots clientReviewEnabled = false", async () => {
    vi.mocked(db.client.findUnique).mockResolvedValue({
      name: 'Beta Co',
      clientReviewEnabled: false,
    } as never)

    await finalizePostGenerationAction({ choice: 'auto-new', runId: 'run_1' })

    expect(db.batch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId: 'client_1',
        clientReviewEnabled: false,
      }),
    })
  })
})
