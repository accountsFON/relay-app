import { describe, it, expect, vi, beforeEach } from 'vitest'

const findManyMock = vi.fn()
const countMock = vi.fn()

vi.mock('@/db/client', () => ({
  db: {
    membership: {
      findMany: (args: unknown) => findManyMock(args),
      count: (args: unknown) => countMock(args),
    },
  },
}))

import { findOrgsWhereLastActiveAdmin } from '@/server/repositories/users'

beforeEach(() => {
  findManyMock.mockReset()
  countMock.mockReset()
})

describe('findOrgsWhereLastActiveAdmin', () => {
  it('returns orgs where the user is the only active admin', async () => {
    findManyMock.mockResolvedValueOnce([
      { organizationId: 'org_solo', organization: { id: 'org_solo', name: 'Solo Agency' } },
      { organizationId: 'org_team', organization: { id: 'org_team', name: 'Team Agency' } },
    ])
    // org_solo has 0 other active admins, org_team has 1.
    countMock.mockResolvedValueOnce(0).mockResolvedValueOnce(1)

    const result = await findOrgsWhereLastActiveAdmin('u_1')

    expect(result).toEqual([{ id: 'org_solo', name: 'Solo Agency' }])
    // The count query must exclude the user themselves and deactivated admins.
    const countArgs = countMock.mock.calls[0][0] as {
      where: Record<string, unknown>
    }
    expect(countArgs.where).toMatchObject({
      organizationId: 'org_solo',
      role: 'admin',
      userId: { not: 'u_1' },
      user: { deactivatedAt: null },
    })
  })

  it('returns empty when the user holds no admin memberships', async () => {
    findManyMock.mockResolvedValueOnce([])
    const result = await findOrgsWhereLastActiveAdmin('u_1')
    expect(result).toEqual([])
    expect(countMock).not.toHaveBeenCalled()
  })
})
