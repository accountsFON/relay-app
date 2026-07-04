import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/middleware/permissions', () => ({
  requireClientEditor: vi.fn(),
  requireGenerationTrigger: vi.fn(),
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

const generateTriggerMock = vi.fn()
vi.mock('@/server/jobs/generateContent', () => ({
  generateContentTask: { trigger: generateTriggerMock },
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

import { requireClientEditor, requireGenerationTrigger } from '@/server/middleware/permissions'
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
  avatarUrl: null,
  platformOwner: false,
  linkedClientId: null,
  permissionOverrides: null,
  roleDefaults: {},
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireClientEditor).mockResolvedValue(mockCtx)
  vi.mocked(requireGenerationTrigger).mockResolvedValue(mockCtx)
  vi.mocked(findClientForUser).mockResolvedValue({
    id: 'client_1',
    name: 'Client One',
    onboardingCompletedAt: new Date('2026-01-01'),
  } as never)
  vi.mocked(createContentRun).mockResolvedValue({ id: 'run_new' } as never)
  // Default: no matching batch. Tests that exercise the match path
  // override this.
  vi.mocked(findMatchingBatchForClientMonth).mockResolvedValue(null)
  generateTriggerMock.mockResolvedValue({ id: 'trigger_handle_1' })
})

describe('generation gate (generation.trigger, not client.edit)', () => {
  it('regenerateContentRun gates on requireGenerationTrigger', async () => {
    vi.mocked(db.contentRun.findMany).mockResolvedValue([] as never)
    await regenerateContentRun('client_1', '2026-05')
    expect(requireGenerationTrigger).toHaveBeenCalled()
    expect(requireClientEditor).not.toHaveBeenCalled()
  })

  it('bulkGenerateContent gates on requireGenerationTrigger', async () => {
    vi.mocked(findExistingRun).mockResolvedValue(null as never)
    await bulkGenerateContent([{ clientId: 'client_1', reCrawl: false }], '2026-05')
    expect(requireGenerationTrigger).toHaveBeenCalled()
    expect(requireClientEditor).not.toHaveBeenCalled()
  })
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
// kickoff step means the InFlightAutoFinalizer routes completions to
// replace (atomic swap) or auto-new without any user popup.
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
      .mockResolvedValueOnce({ id: 'client_a', name: 'A', onboardingCompletedAt: new Date('2026-01-01') } as never)
      .mockResolvedValueOnce({ id: 'client_b', name: 'B', onboardingCompletedAt: new Date('2026-01-01') } as never)
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

// ---------------------------------------------------------------------------
// Onboarding gate: generation must be refused when onboardingCompletedAt
// is null. These are the backstop guards for bulk + regenerate entry points.
// ---------------------------------------------------------------------------

describe('bulkGenerateContent: onboarding gate', () => {
  it('returns an error row (no trigger) when onboardingCompletedAt is null', async () => {
    vi.mocked(findClientForUser).mockResolvedValueOnce({
      id: 'c1',
      name: 'Acme',
      onboardingCompletedAt: null,
    } as never)

    const results = await bulkGenerateContent(
      [{ clientId: 'c1', reCrawl: false }],
      '2026-08',
    )

    expect(results).toHaveLength(1)
    expect(results[0].clientId).toBe('c1')
    expect(results[0].error).toMatch(/onboarding/i)
    expect(generateTriggerMock).not.toHaveBeenCalled()
  })

  it('skips non-onboarded clients without aborting the batch; onboarded clients still generate', async () => {
    // item 1: not onboarded — should be skipped
    vi.mocked(findClientForUser)
      .mockResolvedValueOnce({
        id: 'c1',
        name: 'Acme',
        onboardingCompletedAt: null,
      } as never)
      // item 2: onboarded — should generate
      .mockResolvedValueOnce({
        id: 'c2',
        name: 'Beta',
        onboardingCompletedAt: new Date('2026-01-01'),
      } as never)

    vi.mocked(findExistingRun).mockResolvedValue(null)
    vi.mocked(createContentRun).mockResolvedValue({ id: 'run_c2' } as never)

    const results = await bulkGenerateContent(
      [
        { clientId: 'c1', reCrawl: false },
        { clientId: 'c2', reCrawl: false },
      ],
      '2026-08',
    )

    // c1 is an error row, c2 succeeded
    expect(results).toHaveLength(2)
    expect(results[0].clientId).toBe('c1')
    expect(results[0].error).toMatch(/onboarding/i)
    expect(results[1].clientId).toBe('c2')
    expect(results[1].error).toBeUndefined()

    // trigger called exactly once — for c2 only
    expect(generateTriggerMock).toHaveBeenCalledTimes(1)
  })
})

describe('regenerateContentRun: onboarding gate', () => {
  it('throws and does NOT trigger when onboardingCompletedAt is null', async () => {
    vi.mocked(findClientForUser).mockResolvedValueOnce({
      id: 'c1',
      name: 'Acme',
      onboardingCompletedAt: null,
    } as never)

    await expect(
      regenerateContentRun('c1', '2026-08'),
    ).rejects.toThrow(/onboarding/i)

    expect(generateTriggerMock).not.toHaveBeenCalled()
  })
})
