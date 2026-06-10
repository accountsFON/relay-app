/**
 * Action-layer tests for deactivateUserAction + reactivateUserAction +
 * hardDeleteUserAction (Task 6 of the remove-user feature).
 *
 * Focus: the permission gate (requireCan) plus the org-scope check that the
 * target user actually belongs to the actor's organization
 * (findUserWithMembershipInOrg returns null -> 'User not found').
 *
 * Service-level behavior (self-delete guard, last-owner guard, reassignment,
 * Clerk deletion ordering, audit rows) is covered by
 * tests/server/services/users.test.ts.
 *
 * requireCan is mocked, so it does not enforce the permission matrix here:
 * - happy path proves the action calls requireCan with the right key and the
 *   service with the right args (the matrix does the real gating in prod).
 * - denial cases simulate requireCan throwing for a false-matrix role and
 *   assert the service is never reached.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { OrgContext, UserRole } from '@/lib/types'

vi.mock('@/server/middleware/permissions', () => ({
  requireCan: vi.fn(),
}))

vi.mock('@/server/services/users', () => ({
  deactivateUser: vi.fn(),
  reactivateUser: vi.fn(),
  hardDeleteUser: vi.fn(),
}))

vi.mock('@/server/repositories/users', () => ({
  findUserWithMembershipInOrg: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { requireCan } from '@/server/middleware/permissions'
import {
  deactivateUser,
  reactivateUser,
  hardDeleteUser,
} from '@/server/services/users'
import { findUserWithMembershipInOrg } from '@/server/repositories/users'
import {
  deactivateUserAction,
  reactivateUserAction,
  hardDeleteUserAction,
} from '@/app/(app)/admin/users/actions'

function makeCtx(role: UserRole, overrides: Partial<OrgContext> = {}): OrgContext {
  return {
    userId: 'clerk_user',
    orgId: 'clerk_org',
    role,
    plan: 'agency',
    organizationDbId: 'org_1',
    userDbId: 'u_actor',
    avatarUrl: null,
    platformOwner: false,
    linkedClientId: null,
    permissionOverrides: null,
    roleDefaults: {},
    ...overrides,
  }
}

// Default: target IS a member of the actor's org.
function targetInOrg() {
  vi.mocked(findUserWithMembershipInOrg).mockResolvedValue({
    id: 'u_target',
  } as never)
}

// Cross-org / not found: no membership in the actor's org.
function targetNotInOrg() {
  vi.mocked(findUserWithMembershipInOrg).mockResolvedValue(null as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(deactivateUser).mockResolvedValue({
    userId: 'u_target',
    deactivated: true,
  } as never)
  vi.mocked(reactivateUser).mockResolvedValue({
    userId: 'u_target',
    deactivated: false,
  } as never)
  vi.mocked(hardDeleteUser).mockResolvedValue({
    userId: 'u_target',
  } as never)
})

describe('deactivateUserAction', () => {
  it('admin: calls requireCan(user.deactivate) and the service with actor identity', async () => {
    vi.mocked(requireCan).mockResolvedValue(makeCtx('admin'))
    targetInOrg()

    const result = await deactivateUserAction({ userId: 'u_target' })

    expect(requireCan).toHaveBeenCalledWith('user.deactivate')
    expect(deactivateUser).toHaveBeenCalledWith({
      userId: 'u_target',
      actorId: 'u_actor',
      actorOrganizationId: 'org_1',
    })
    expect(result).toEqual({ userId: 'u_target', deactivated: true })
  })

  it('account_manager is denied (requireCan throws, service not called)', async () => {
    vi.mocked(requireCan).mockRejectedValue(new Error('Forbidden'))

    await expect(
      deactivateUserAction({ userId: 'u_target' }),
    ).rejects.toThrow()
    expect(deactivateUser).not.toHaveBeenCalled()
  })

  it('designer is denied (requireCan throws, service not called)', async () => {
    vi.mocked(requireCan).mockRejectedValue(new Error('Forbidden'))

    await expect(
      deactivateUserAction({ userId: 'u_target' }),
    ).rejects.toThrow()
    expect(deactivateUser).not.toHaveBeenCalled()
  })

  it('client is denied (requireCan throws, service not called)', async () => {
    vi.mocked(requireCan).mockRejectedValue(new Error('Forbidden'))

    await expect(
      deactivateUserAction({ userId: 'u_target' }),
    ).rejects.toThrow()
    expect(deactivateUser).not.toHaveBeenCalled()
  })

  it('cross-org target throws User not found and service not called', async () => {
    vi.mocked(requireCan).mockResolvedValue(makeCtx('admin'))
    targetNotInOrg()

    await expect(
      deactivateUserAction({ userId: 'u_target' }),
    ).rejects.toThrow(/user not found/i)
    expect(findUserWithMembershipInOrg).toHaveBeenCalledWith('u_target', 'org_1')
    expect(deactivateUser).not.toHaveBeenCalled()
  })
})

describe('reactivateUserAction', () => {
  it('admin: calls requireCan(user.deactivate) and the service with actor identity', async () => {
    vi.mocked(requireCan).mockResolvedValue(makeCtx('admin'))
    targetInOrg()

    const result = await reactivateUserAction({ userId: 'u_target' })

    expect(requireCan).toHaveBeenCalledWith('user.deactivate')
    expect(reactivateUser).toHaveBeenCalledWith({
      userId: 'u_target',
      actorId: 'u_actor',
      actorOrganizationId: 'org_1',
    })
    expect(result).toEqual({ userId: 'u_target', deactivated: false })
  })

  it('account_manager is denied (requireCan throws, service not called)', async () => {
    vi.mocked(requireCan).mockRejectedValue(new Error('Forbidden'))

    await expect(
      reactivateUserAction({ userId: 'u_target' }),
    ).rejects.toThrow()
    expect(reactivateUser).not.toHaveBeenCalled()
  })

  it('cross-org target throws User not found and service not called', async () => {
    vi.mocked(requireCan).mockResolvedValue(makeCtx('admin'))
    targetNotInOrg()

    await expect(
      reactivateUserAction({ userId: 'u_target' }),
    ).rejects.toThrow(/user not found/i)
    expect(reactivateUser).not.toHaveBeenCalled()
  })
})

describe('hardDeleteUserAction', () => {
  it('platformOwner: calls requireCan(user.hardDelete) and the service with reassign + actor identity', async () => {
    vi.mocked(requireCan).mockResolvedValue(
      makeCtx('admin', { platformOwner: true }),
    )
    targetInOrg()

    const result = await hardDeleteUserAction({
      userId: 'u_target',
      reassignToUserId: 'u_keep',
    })

    expect(requireCan).toHaveBeenCalledWith('user.hardDelete')
    expect(hardDeleteUser).toHaveBeenCalledWith({
      userId: 'u_target',
      reassignToUserId: 'u_keep',
      actorId: 'u_actor',
      actorOrganizationId: 'org_1',
    })
    expect(result).toEqual({ userId: 'u_target' })
  })

  it('admin (non platformOwner) is denied (requireCan throws, service not called)', async () => {
    vi.mocked(requireCan).mockRejectedValue(new Error('Forbidden'))

    await expect(
      hardDeleteUserAction({ userId: 'u_target', reassignToUserId: 'u_keep' }),
    ).rejects.toThrow()
    expect(hardDeleteUser).not.toHaveBeenCalled()
  })

  it('defense-in-depth: requireCan passes (override granted) but platformOwner is false -> throws, service not called', async () => {
    // Edge case: a platform owner grants the user.hardDelete override to a
    // non-owner. requireCan resolves, but the explicit platformOwner assert
    // must still block the irreversible delete.
    vi.mocked(requireCan).mockResolvedValue(
      makeCtx('admin', { platformOwner: false }),
    )
    targetInOrg()

    await expect(
      hardDeleteUserAction({ userId: 'u_target', reassignToUserId: 'u_keep' }),
    ).rejects.toThrow(/only a platform owner/i)
    expect(hardDeleteUser).not.toHaveBeenCalled()
  })

  it('account_manager is denied (requireCan throws, service not called)', async () => {
    vi.mocked(requireCan).mockRejectedValue(new Error('Forbidden'))

    await expect(
      hardDeleteUserAction({ userId: 'u_target', reassignToUserId: 'u_keep' }),
    ).rejects.toThrow()
    expect(hardDeleteUser).not.toHaveBeenCalled()
  })

  it('designer is denied (requireCan throws, service not called)', async () => {
    vi.mocked(requireCan).mockRejectedValue(new Error('Forbidden'))

    await expect(
      hardDeleteUserAction({ userId: 'u_target', reassignToUserId: 'u_keep' }),
    ).rejects.toThrow()
    expect(hardDeleteUser).not.toHaveBeenCalled()
  })

  it('client is denied (requireCan throws, service not called)', async () => {
    vi.mocked(requireCan).mockRejectedValue(new Error('Forbidden'))

    await expect(
      hardDeleteUserAction({ userId: 'u_target', reassignToUserId: 'u_keep' }),
    ).rejects.toThrow()
    expect(hardDeleteUser).not.toHaveBeenCalled()
  })

  it('cross-org target throws User not found and service not called', async () => {
    vi.mocked(requireCan).mockResolvedValue(
      makeCtx('admin', { platformOwner: true }),
    )
    targetNotInOrg()

    await expect(
      hardDeleteUserAction({ userId: 'u_target', reassignToUserId: 'u_keep' }),
    ).rejects.toThrow(/user not found/i)
    expect(findUserWithMembershipInOrg).toHaveBeenCalledWith('u_target', 'org_1')
    expect(hardDeleteUser).not.toHaveBeenCalled()
  })
})
