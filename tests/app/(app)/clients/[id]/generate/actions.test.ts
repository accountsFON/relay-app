import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/middleware/permissions', () => ({
  requireClientEditor: vi.fn(),
}))

vi.mock('@/server/repositories/contentRuns', () => ({
  createContentRun: vi.fn(),
  findExistingRun: vi.fn(),
  findContentRunForOrg: vi.fn(),
}))

vi.mock('@/server/repositories/clients', () => ({
  findClientForUser: vi.fn(),
}))

vi.mock('@/db/client', () => ({
  db: {
    contentRun: { update: vi.fn() },
    post: { deleteMany: vi.fn() },
  },
}))

import { requireClientEditor } from '@/server/middleware/permissions'
import { findContentRunForOrg } from '@/server/repositories/contentRuns'
import { getRunStatus } from '@/app/(app)/clients/[id]/generate/actions'

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
