import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireOrgContextMock = vi.fn()
vi.mock('@/server/middleware/auth', () => ({
  requireOrgContext: () => requireOrgContextMock(),
}))

const selfDeactivateUserMock = vi.fn()
vi.mock('@/server/services/users', () => ({
  selfDeactivateUser: (input: unknown) => selfDeactivateUserMock(input),
}))

import { closeMyAccountAction } from '@/app/(app)/settings/account/actions'

beforeEach(() => {
  requireOrgContextMock.mockReset()
  selfDeactivateUserMock.mockReset()
})

describe('closeMyAccountAction', () => {
  it('passes the resolved ctx actor into selfDeactivateUser', async () => {
    requireOrgContextMock.mockResolvedValueOnce({
      userDbId: 'u_self',
      organizationDbId: 'org_1',
      platformOwner: false,
    })
    selfDeactivateUserMock.mockResolvedValueOnce({
      userId: 'u_self',
      deactivated: true,
    })

    const result = await closeMyAccountAction()

    expect(selfDeactivateUserMock).toHaveBeenCalledWith({
      actorId: 'u_self',
      actorOrganizationId: 'org_1',
      actorIsPlatformOwner: false,
    })
    expect(result).toEqual({ userId: 'u_self', deactivated: true })
  })
})
