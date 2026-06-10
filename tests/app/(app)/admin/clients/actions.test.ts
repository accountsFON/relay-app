import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/middleware/permissions', () => ({
  requireAdminPortal: vi.fn(),
}))

vi.mock('@/server/repositories/clients', () => ({
  assignClientAm: vi.fn(),
  assignClientDesigner: vi.fn(),
  findClientById: vi.fn(),
}))

vi.mock('@/server/repositories/memberships', () => ({
  findMembership: vi.fn(),
}))

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
  db: {
    user: {
      findUnique: vi.fn(async () => ({ name: 'Test Person' })),
    },
  },
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { requireAdminPortal } from '@/server/middleware/permissions'
import { findMembership } from '@/server/repositories/memberships'
import { findClientById } from '@/server/repositories/clients'
import { recordActivity } from '@/server/services/activity'
import { setClientPrimary } from '@/app/(app)/admin/clients/actions'

const mockCtx = {
  userId: 'user_clerk_actor',
  orgId: 'fon-internal',
  role: 'admin' as const,
  plan: 'agency' as const,
  organizationDbId: 'cuid_org_1',
  userDbId: 'cuid_actor',
  avatarUrl: null,
  platformOwner: false,
  linkedClientId: null,
  permissionOverrides: null,
  roleDefaults: {},
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdminPortal).mockResolvedValue(mockCtx)
  vi.mocked(findMembership).mockResolvedValue({
    id: 'mem_1',
    role: 'team',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
})

describe('setClientPrimary', () => {
  it('assigning an AM mentions the new AM in the activity event', async () => {
    await setClientPrimary({
      clientId: 'cuid_client_1',
      slot: 'am',
      userId: 'cuid_new_am',
    })
    expect(recordActivity).toHaveBeenCalledOnce()
    const call = vi.mocked(recordActivity).mock.calls[0][0]
    expect(call.kind).toBe('client_am_assigned')
    expect(call.mentionedUserIds).toEqual(['cuid_new_am'])
  })

  it('assigning a Designer mentions the new Designer in the activity event', async () => {
    await setClientPrimary({
      clientId: 'cuid_client_1',
      slot: 'designer',
      userId: 'cuid_new_designer',
    })
    const call = vi.mocked(recordActivity).mock.calls[0][0]
    expect(call.kind).toBe('client_designer_assigned')
    expect(call.mentionedUserIds).toEqual(['cuid_new_designer'])
  })

  it('does not mention the actor when an admin assigns themselves', async () => {
    await setClientPrimary({
      clientId: 'cuid_client_1',
      slot: 'am',
      userId: 'cuid_actor',
    })
    const call = vi.mocked(recordActivity).mock.calls[0][0]
    expect(call.mentionedUserIds).toEqual([])
  })

  it('unassigning notifies the outgoing AM', async () => {
    vi.mocked(findClientById).mockResolvedValue({
      assignedAmId: 'cuid_prev_am',
      assignedDesignerId: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    await setClientPrimary({
      clientId: 'cuid_client_1',
      slot: 'am',
      userId: null,
    })
    const call = vi.mocked(recordActivity).mock.calls[0][0]
    expect(call.kind).toBe('client_am_unassigned')
    expect(call.mentionedUserIds).toEqual(['cuid_prev_am'])
  })

  it('does not notify when the unassigned user is the actor themselves', async () => {
    vi.mocked(findClientById).mockResolvedValue({
      assignedAmId: 'cuid_actor',
      assignedDesignerId: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    await setClientPrimary({
      clientId: 'cuid_client_1',
      slot: 'am',
      userId: null,
    })
    const call = vi.mocked(recordActivity).mock.calls[0][0]
    expect(call.mentionedUserIds).toEqual([])
  })
})
