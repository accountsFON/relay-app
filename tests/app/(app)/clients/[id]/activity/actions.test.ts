import { describe, it, expect, vi, beforeEach } from 'vitest'

// postCommentAction gates on requireCan('client.comment'). We mock the
// middleware so the gate is the only thing under test here: a comment-capable
// caller (admin/AM/designer) resolves an OrgContext, a non-capable caller
// (client, or anyone the gate rejects) throws.
vi.mock('@/server/middleware/permissions', () => ({
  requireCan: vi.fn(),
}))

vi.mock('@/server/repositories/clients', () => ({
  findClientForUser: vi.fn(),
}))

vi.mock('@/server/repositories/memberships', () => ({
  listMembershipsForOrg: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/server/services/activity', () => ({
  recordActivity: vi.fn(),
}))

vi.mock('@/server/repositories/activityEvents', () => ({
  markMentionRead: vi.fn(),
}))

vi.mock('@/server/middleware/auth', () => ({
  requireOrgContext: vi.fn(),
}))

vi.mock('@/db/client', () => ({
  db: { mention: { updateMany: vi.fn() } },
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { requireCan } from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import { recordActivity } from '@/server/services/activity'
import { postCommentAction } from '@/app/(app)/clients/[id]/activity/actions'

function ctxFor(role: 'admin' | 'account_manager' | 'designer') {
  return {
    userId: `user_clerk_${role}`,
    orgId: 'org_clerk_1',
    role,
    plan: 'agency' as const,
    organizationDbId: 'org_db_1',
    userDbId: `user_db_${role}`,
    platformOwner: false,
    linkedClientId: null,
    permissionOverrides: null,
    roleDefaults: {},
  }
}

const mockClient = { id: 'client_1', name: 'Demo', organizationId: 'org_db_1' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(findClientForUser).mockResolvedValue(mockClient as never)
  vi.mocked(recordActivity).mockResolvedValue({ id: 'evt_1' } as never)
})

describe('postCommentAction — gated on client.comment', () => {
  it('succeeds for a designer (designer has client.comment)', async () => {
    vi.mocked(requireCan).mockResolvedValue(ctxFor('designer') as never)

    const result = await postCommentAction({
      clientId: 'client_1',
      body: 'done with the graphics',
    })

    expect(requireCan).toHaveBeenCalledWith('client.comment')
    expect(result).toEqual({ id: 'evt_1' })
    expect(recordActivity).toHaveBeenCalledTimes(1)
    // Comment stays internal: no visibility override is passed to recordActivity.
    const call = vi.mocked(recordActivity).mock.calls[0][0] as unknown as Record<
      string,
      unknown
    >
    expect(call).not.toHaveProperty('visibility')
    expect(call.actorId).toBe('user_db_designer')
  })

  it('succeeds for an account_manager', async () => {
    vi.mocked(requireCan).mockResolvedValue(ctxFor('account_manager') as never)
    const result = await postCommentAction({ clientId: 'client_1', body: 'ping' })
    expect(result).toEqual({ id: 'evt_1' })
  })

  it('rejects a caller the gate denies (e.g. client / role without client.comment)', async () => {
    // requireCan redirects/throws for callers lacking the permission; model
    // that as a throw so we assert the action never writes.
    vi.mocked(requireCan).mockRejectedValue(new Error('NEXT_REDIRECT:/no-access'))

    await expect(
      postCommentAction({ clientId: 'client_1', body: 'should not post' }),
    ).rejects.toThrow('NEXT_REDIRECT:/no-access')

    expect(requireCan).toHaveBeenCalledWith('client.comment')
    expect(recordActivity).not.toHaveBeenCalled()
  })

  it('rejects an empty body before touching the gate', async () => {
    await expect(
      postCommentAction({ clientId: 'client_1', body: '   ' }),
    ).rejects.toThrow('Comment body cannot be empty')
    expect(requireCan).not.toHaveBeenCalled()
  })
})
