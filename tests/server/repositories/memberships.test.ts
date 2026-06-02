import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/client', () => ({
  db: {
    membership: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}))

import { db } from '@/db/client'
import {
  listMembershipsForOrg,
  updateMembershipRole,
} from '@/server/repositories/memberships'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listMembershipsForOrg', () => {
  it('excludes deactivated users from the where clause so assignment pickers only show active users', async () => {
    vi.mocked(db.membership.findMany).mockResolvedValue([])

    await listMembershipsForOrg('cuid_org_1')

    expect(db.membership.findMany).toHaveBeenCalledTimes(1)
    const arg = vi.mocked(db.membership.findMany).mock.calls[0][0]

    // The where clause must scope to the org
    expect(arg?.where).toMatchObject({ organizationId: 'cuid_org_1' })

    // The user nested filter must exclude deactivated users
    expect(arg?.where).toMatchObject({
      user: { deactivatedAt: null },
    })
  })

  it('includeDeactivated: true keeps deactivated users in the result (no user.deactivatedAt filter) for the admin roster', async () => {
    vi.mocked(db.membership.findMany).mockResolvedValue([])

    await listMembershipsForOrg('cuid_org_1', { includeDeactivated: true })

    expect(db.membership.findMany).toHaveBeenCalledTimes(1)
    const arg = vi.mocked(db.membership.findMany).mock.calls[0][0]

    // Still scoped to the org
    expect(arg?.where).toMatchObject({ organizationId: 'cuid_org_1' })

    // The deactivated-user filter must NOT be present
    expect(arg?.where).not.toHaveProperty('user')
  })

  it('returns memberships with user details when found', async () => {
    const fakeMembership = {
      id: 'mem_1',
      userId: 'user_1',
      organizationId: 'cuid_org_1',
      role: 'account_manager',
      permissionOverrides: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: {
        id: 'user_1',
        name: 'Jane Smith',
        email: 'jane@example.com',
        avatarUrl: null,
      },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.membership.findMany).mockResolvedValue([fakeMembership] as any)

    const result = await listMembershipsForOrg('cuid_org_1')

    expect(result).toHaveLength(1)
    expect(result[0].user.name).toBe('Jane Smith')
  })
})

describe('updateMembershipRole', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const membership = (overrides: Record<string, unknown> = {}): any => ({
    id: 'mem_1',
    userId: 'user_1',
    organizationId: 'cuid_org_1',
    role: 'account_manager',
    ...overrides,
  })

  it('blocks setting the client role when the user has no linkedClientId, and does not update', async () => {
    vi.mocked(db.membership.findUnique).mockResolvedValue(membership())
    vi.mocked(db.user.findUnique).mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { linkedClientId: null } as any,
    )

    await expect(updateMembershipRole('mem_1', 'client')).rejects.toThrow(
      /link this account to a client/i,
    )

    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      select: { linkedClientId: true },
    })
    expect(db.membership.update).not.toHaveBeenCalled()
  })

  it('allows setting the client role when the user has a linkedClientId', async () => {
    vi.mocked(db.membership.findUnique).mockResolvedValue(membership())
    vi.mocked(db.user.findUnique).mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { linkedClientId: 'client_1' } as any,
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.membership.update).mockResolvedValue({} as any)

    await updateMembershipRole('mem_1', 'client')

    expect(db.membership.update).toHaveBeenCalledWith({
      where: { id: 'mem_1' },
      data: { role: 'client' },
    })
  })

  it('updates a non-client role change without touching linkedClientId (regression)', async () => {
    vi.mocked(db.membership.findUnique).mockResolvedValue(membership())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.membership.update).mockResolvedValue({} as any)

    await updateMembershipRole('mem_1', 'designer')

    expect(db.user.findUnique).not.toHaveBeenCalled()
    expect(db.membership.update).toHaveBeenCalledWith({
      where: { id: 'mem_1' },
      data: { role: 'designer' },
    })
  })
})
