import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/middleware/permissions', () => ({
  requireClientEditor: vi.fn(),
}))

vi.mock('@/server/repositories/contentRuns', () => ({
  archiveContentRun: vi.fn(),
  createContentRun: vi.fn(),
  findExistingRun: vi.fn(),
  findContentRunForOrg: vi.fn(),
}))

vi.mock('@/server/repositories/clients', () => ({
  findClientForUser: vi.fn(),
}))

vi.mock('@/server/jobs/generateContent', () => ({
  generateContentTask: { trigger: vi.fn() },
}))

vi.mock('@/db/client', () => ({
  db: {
    contentRun: { update: vi.fn() },
    post: { deleteMany: vi.fn() },
  },
}))

import { requireClientEditor } from '@/server/middleware/permissions'
import {
  archiveContentRun,
  createContentRun,
  findContentRunForOrg,
  findExistingRun,
} from '@/server/repositories/contentRuns'
import { findClientForUser } from '@/server/repositories/clients'
import {
  getRunStatus,
  triggerGeneration,
} from '@/app/(app)/clients/[id]/generate/actions'

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

const mockInScopeRun = {
  id: 'run_1',
  clientId: 'client_1',
  status: 'complete',
  brief: 'some brief text',
  crawledContent: 'crawled text',
  supportingFacts: 'facts',
  posts: [{ id: 'post_1' }, { id: 'post_2' }],
  totalCostUsd: { toString: () => '0.42' } as never,
  errorMessage: null,
  client: { organizationId: 'cuid_org_1' },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireClientEditor).mockResolvedValue(mockCtx)
})

describe('getRunStatus', () => {
  it('returns run status for in-scope runs', async () => {
    vi.mocked(findContentRunForOrg).mockResolvedValue(mockInScopeRun as never)

    const result = await getRunStatus('run_1')

    expect(result).toEqual({
      id: 'run_1',
      status: 'complete',
      brief: true,
      crawledContent: true,
      supportingFacts: true,
      postCount: 2,
      totalCostUsd: 0.42,
      errorMessage: null,
    })

    // Verify the scoped lookup was used (not the unsafe findContentRun)
    expect(findContentRunForOrg).toHaveBeenCalledWith('run_1', 'cuid_org_1')
  })

  it('returns null when the run belongs to a different organization', async () => {
    // findContentRunForOrg returns null for cross-org runs
    vi.mocked(findContentRunForOrg).mockResolvedValue(null)

    const result = await getRunStatus('run_in_other_org')

    expect(result).toBeNull()
  })

  it('requires auth — calls requireClientEditor before any lookup', async () => {
    // Previously this endpoint had no auth call at all. Verify it now does.
    vi.mocked(findContentRunForOrg).mockResolvedValue(null)

    await getRunStatus('any_run')

    expect(requireClientEditor).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// triggerGeneration: previous-run displacement must soft-delete via
// archiveContentRun rather than hard-delete via db.contentRun.delete +
// db.post.deleteMany. Without soft-delete, a user who clicks Generate over
// a previously-attached batch loses ~$0.40 of AI spend with no recovery.
// ---------------------------------------------------------------------------

describe('triggerGeneration: existing-run displacement (Phase 4)', () => {
  beforeEach(() => {
    // Default mocks for happy-path triggerGeneration calls.
    vi.mocked(findClientForUser).mockResolvedValue({
      id: 'client_1',
      autoCrawl: 'never',
      crawledData: null,
    } as never)
    vi.mocked(createContentRun).mockResolvedValue({ id: 'run_new' } as never)
  })

  it('soft-deletes the previous run via archiveContentRun when no targetBatchId is provided', async () => {
    vi.mocked(findExistingRun).mockResolvedValue({
      id: 'run_prev',
      status: 'complete',
    } as never)

    await triggerGeneration('client_1', '2026-05')

    // archiveContentRun was called with the previous run + actor user id
    expect(archiveContentRun).toHaveBeenCalledWith({
      runId: 'run_prev',
      actorUserId: 'cuid_user_1',
    })
  })

  it('does NOT archive when targetBatchId is set (atomic swap path)', async () => {
    vi.mocked(findExistingRun).mockResolvedValue({
      id: 'run_prev',
      status: 'complete',
    } as never)

    await triggerGeneration('client_1', '2026-05', undefined, {
      targetBatchId: 'batch_target',
    })

    // Atomic swap at finalize handles cleanup; archive must NOT run here
    // or the target batch would be emptied before the new run completes.
    expect(archiveContentRun).not.toHaveBeenCalled()
  })

  it('does NOT archive when there is no existing run', async () => {
    vi.mocked(findExistingRun).mockResolvedValue(null)

    await triggerGeneration('client_1', '2026-05')

    expect(archiveContentRun).not.toHaveBeenCalled()
  })

  it('throws and does NOT archive when the existing run is still running', async () => {
    vi.mocked(findExistingRun).mockResolvedValue({
      id: 'run_prev',
      status: 'running',
    } as never)

    await expect(triggerGeneration('client_1', '2026-05')).rejects.toThrow(
      /in progress/i,
    )
    expect(archiveContentRun).not.toHaveBeenCalled()
  })
})
