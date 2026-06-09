import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/middleware/permissions', () => ({
  requireAdminPortal: vi.fn(),
}))
vi.mock('@/server/repositories/clients', () => ({
  assignClientAm: vi.fn(),
  assignClientDesigner: vi.fn(),
}))
vi.mock('@/server/repositories/memberships', () => ({
  findMembership: vi.fn(),
  updateMembershipRole: vi.fn(),
  updateMembershipPermissionOverrides: vi.fn(),
}))
vi.mock('@/server/repositories/permissionAuditLogs', () => ({
  recordPermissionAudits: vi.fn(),
}))
vi.mock('@/server/auth/permissions', () => ({ PERMISSION_KEYS: [] }))
vi.mock('@/server/services/activity', () => ({
  recordActivity: vi.fn(),
  ActivityKind: {
    client_am_assigned: 'client_am_assigned',
    client_designer_assigned: 'client_designer_assigned',
    client_am_unassigned: 'client_am_unassigned',
    client_designer_unassigned: 'client_designer_unassigned',
  },
}))
vi.mock('@/db/client', () => ({
  db: { user: { findUnique: vi.fn(async () => ({ name: 'Target Person' })) } },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { requireAdminPortal } from '@/server/middleware/permissions'
import { findMembership } from '@/server/repositories/memberships'
import { recordActivity } from '@/server/services/activity'
import { setClientAssignment } from '@/app/(app)/admin/users/[id]/actions'

const mockCtx = {
  userId: 'clerk_actor',
  orgId: 'fon',
  role: 'admin' as const,
  plan: 'agency' as const,
  organizationDbId: 'cuid_org',
  userDbId: 'cuid_actor',
  platformOwner: false,
  linkedClientId: null,
  permissionOverrides: null,
  roleDefaults: {},
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdminPortal).mockResolvedValue(mockCtx)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(findMembership).mockResolvedValue({ id: 'mem_1', role: 'team' } as any)
})

describe('setClientAssignment', () => {
  it('unassigning a client notifies the affected user', async () => {
    await setClientAssignment({
      userId: 'cuid_target',
      clientId: 'cuid_client',
      slot: 'am',
      assigned: false,
    })
    const call = vi.mocked(recordActivity).mock.calls[0][0]
    expect(call.kind).toBe('client_am_unassigned')
    expect(call.mentionedUserIds).toEqual(['cuid_target'])
  })

  it('assigning a client notifies the affected user', async () => {
    await setClientAssignment({
      userId: 'cuid_target',
      clientId: 'cuid_client',
      slot: 'designer',
      assigned: true,
    })
    const call = vi.mocked(recordActivity).mock.calls[0][0]
    expect(call.kind).toBe('client_designer_assigned')
    expect(call.mentionedUserIds).toEqual(['cuid_target'])
  })

  it('does not notify when the admin acts on their own assignment', async () => {
    await setClientAssignment({
      userId: 'cuid_actor',
      clientId: 'cuid_client',
      slot: 'am',
      assigned: false,
    })
    const call = vi.mocked(recordActivity).mock.calls[0][0]
    expect(call.mentionedUserIds).toEqual([])
  })
})
