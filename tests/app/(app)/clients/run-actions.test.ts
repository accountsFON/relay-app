import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/middleware/permissions', () => ({
  requireClientEditor: vi.fn(),
}))

vi.mock('@/server/repositories/contentRuns', () => ({
  archiveContentRun: vi.fn(),
  createContentRun: vi.fn(),
  findExistingRun: vi.fn(),
  findMatchingBatchForClientMonth: vi.fn(),
}))

vi.mock('@/server/repositories/clients', () => ({
  findClientForUser: vi.fn(),
}))

vi.mock('@/server/jobs/generateContent', () => ({
  generateContentTask: { trigger: vi.fn() },
}))

vi.mock('@/db/client', () => ({
  db: {
    contentRun: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    post: {
      deleteMany: vi.fn(),
    },
  },
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { requireClientEditor } from '@/server/middleware/permissions'
import {
  archiveContentRun,
  createContentRun,
  findExistingRun,
  findMatchingBatchForClientMonth,
} from '@/server/repositories/contentRuns'
import { findClientForUser } from '@/server/repositories/clients'
import { db } from '@/db/client'
import {
  regenerateContentRun,
  bulkGenerateContent,
} from '@/app/(app)/clients/run-actions'

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

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireClientEditor).mockResolvedValue(mockCtx)
  vi.mocked(findClientForUser).mockResolvedValue({
    id: 'client_1',
    name: 'Client One',
  } as never)
  vi.mocked(createContentRun).mockResolvedValue({ id: 'run_new' } as never)
  // Default: no matching batch. Tests that exercise the match path
  // override this.
  vi.mocked(findMatchingBatchForClientMonth).mockResolvedValue(null)
})

describe('regenerateContentRun: soft-delete displacement (Phase 4)', () => {
  it('soft-deletes existing runs via archiveContentRun instead of hard-deleting', async () => {
    vi.mocked(db.contentRun.findMany).mockResolvedValue([
      { id: 'run_a', status: 'complete' },
      { id: 'run_b', status: 'complete' },
    ] as never)

    await regenerateContentRun('client_1', '2026-05')

    // Both existing runs were archived
    expect(archiveContentRun).toHaveBeenCalledTimes(2)
    expect(archiveContentRun).toHaveBeenCalledWith({
      runId: 'run_a',
      actorUserId: 'cuid_user_1',
    })
    expect(archiveContentRun).toHaveBeenCalledWith({
      runId: 'run_b',
      actorUserId: 'cuid_user_1',
    })

    // Hard-delete paths must NOT have been used
    expect(db.post.deleteMany).not.toHaveBeenCalled()
  })

  it('throws and does NOT archive when an existing run is still running', async () => {
    vi.mocked(db.contentRun.findMany).mockResolvedValue([
      { id: 'run_a', status: 'running' },
    ] as never)

    await expect(regenerateContentRun('client_1', '2026-05')).rejects.toThrow(
      /in progress/i,
    )
    expect(archiveContentRun).not.toHaveBeenCalled()
  })
})

describe('bulkGenerateContent: soft-delete displacement (Phase 4)', () => {
  it('soft-deletes the existing run for each client via archiveContentRun', async () => {
    vi.mocked(findExistingRun).mockResolvedValueOnce({
      id: 'run_existing_a',
      status: 'complete',
    } as never)
    vi.mocked(findExistingRun).mockResolvedValueOnce({
      id: 'run_existing_b',
      status: 'complete',
    } as never)

    await bulkGenerateContent(
      [
        { clientId: 'client_a', reCrawl: false },
        { clientId: 'client_b', reCrawl: false },
      ],
      '2026-05',
    )

    // Both displaced runs were archived
    expect(archiveContentRun).toHaveBeenCalledTimes(2)
    expect(archiveContentRun).toHaveBeenCalledWith({
      runId: 'run_existing_a',
      actorUserId: 'cuid_user_1',
    })
    expect(archiveContentRun).toHaveBeenCalledWith({
      runId: 'run_existing_b',
      actorUserId: 'cuid_user_1',
    })

    // Hard-delete must NOT have been used
    expect(db.post.deleteMany).not.toHaveBeenCalled()
  })

  it('skips a client whose existing run is still running, no archive fired', async () => {
    vi.mocked(findExistingRun).mockResolvedValueOnce({
      id: 'run_running',
      status: 'running',
    } as never)

    const results = await bulkGenerateContent(
      [{ clientId: 'client_a', reCrawl: false }],
      '2026-05',
    )

    expect(results[0].error).toMatch(/already running/i)
    expect(archiveContentRun).not.toHaveBeenCalled()
  })

  it('does NOT archive when no existing run is present', async () => {
    vi.mocked(findExistingRun).mockResolvedValueOnce(null)

    await bulkGenerateContent(
      [{ clientId: 'client_a', reCrawl: false }],
      '2026-05',
    )

    expect(archiveContentRun).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Phase 6: pre-flight Replace resolution. Resolving targetBatchId at the
// kickoff step means the InFlightAutoFinalizer can route completions to
// replace (atomic swap) or auto-new without falling back to the legacy
// InFlightChoiceModal. Removing that modal becomes possible once these
// flows stop minting legacy-shaped runs.
// ---------------------------------------------------------------------------

describe('regenerateContentRun: pre-flight Replace resolution (Phase 6)', () => {
  it('passes targetBatchId when a matching batch exists for the client + month', async () => {
    vi.mocked(db.contentRun.findMany).mockResolvedValue([] as never)
    vi.mocked(findMatchingBatchForClientMonth).mockResolvedValue({
      id: 'batch_existing',
      label: 'Client One May 2026',
      postCount: 12,
    })

    await regenerateContentRun('client_1', '2026-05')

    expect(createContentRun).toHaveBeenCalledWith({
      clientId: 'client_1',
      triggeredById: 'cuid_user_1',
      targetMonth: '2026-05',
      targetBatchId: 'batch_existing',
    })
  })

  it('passes targetBatchId: null when there is no matching batch', async () => {
    vi.mocked(db.contentRun.findMany).mockResolvedValue([] as never)
    vi.mocked(findMatchingBatchForClientMonth).mockResolvedValue(null)

    await regenerateContentRun('client_1', '2026-05')

    expect(createContentRun).toHaveBeenCalledWith({
      clientId: 'client_1',
      triggeredById: 'cuid_user_1',
      targetMonth: '2026-05',
      targetBatchId: null,
    })
  })
})

describe('bulkGenerateContent: pre-flight Replace resolution (Phase 6)', () => {
  it('resolves matching batch per client independently', async () => {
    vi.mocked(findClientForUser)
      .mockResolvedValueOnce({ id: 'client_a', name: 'A' } as never)
      .mockResolvedValueOnce({ id: 'client_b', name: 'B' } as never)
    vi.mocked(findExistingRun).mockResolvedValue(null)
    vi.mocked(findMatchingBatchForClientMonth)
      .mockResolvedValueOnce({ id: 'batch_a', label: 'A May 2026', postCount: 5 })
      .mockResolvedValueOnce(null)

    await bulkGenerateContent(
      [
        { clientId: 'client_a', reCrawl: false },
        { clientId: 'client_b', reCrawl: false },
      ],
      '2026-05',
    )

    // First client got the matched batch as targetBatchId
    expect(createContentRun).toHaveBeenNthCalledWith(1, {
      clientId: 'client_a',
      triggeredById: 'cuid_user_1',
      targetMonth: '2026-05',
      targetBatchId: 'batch_a',
    })
    // Second client (no match) got null
    expect(createContentRun).toHaveBeenNthCalledWith(2, {
      clientId: 'client_b',
      triggeredById: 'cuid_user_1',
      targetMonth: '2026-05',
      targetBatchId: null,
    })
  })
})
