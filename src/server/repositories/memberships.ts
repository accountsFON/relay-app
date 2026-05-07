import { db } from '@/db/client'
import type { UserRole } from '@/lib/types'

/** Find the active membership for a user on a given org. Null if none. */
export async function findMembership(userId: string, organizationId: string) {
  return db.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
  })
}

/** All memberships for a single user. Used by the org switcher. */
export async function listMembershipsForUser(userId: string) {
  return db.membership.findMany({
    where: { userId },
    include: {
      organization: {
        select: { id: true, name: true, clerkOrgId: true, plan: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  })
}

/** All memberships in a given org. Used by /admin/users. */
export async function listMembershipsForOrg(organizationId: string) {
  return db.membership.findMany({
    where: { organizationId },
    include: {
      user: {
        select: { id: true, name: true, email: true, avatarUrl: true },
      },
    },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  })
}

export async function createMembership(input: {
  userId: string
  organizationId: string
  role: UserRole
  permissionOverrides?: Record<string, boolean> | null
}) {
  return db.membership.create({
    data: {
      userId: input.userId,
      organizationId: input.organizationId,
      role: input.role,
      permissionOverrides: input.permissionOverrides ?? undefined,
    },
  })
}

/**
 * Updates a Membership's role. At-least-one-admin invariant: an org must
 * always have at least one admin Membership. Demoting the only admin throws.
 */
export async function updateMembershipRole(
  membershipId: string,
  newRole: UserRole,
) {
  const current = await db.membership.findUnique({ where: { id: membershipId } })
  if (!current) throw new Error('Membership not found')

  if (current.role === 'admin' && newRole !== 'admin') {
    const otherAdminCount = await db.membership.count({
      where: {
        organizationId: current.organizationId,
        role: 'admin',
        id: { not: membershipId },
      },
    })
    if (otherAdminCount === 0) {
      throw new Error(
        'Cannot demote the last admin of this agency. Promote someone else first.',
      )
    }
  }

  return db.membership.update({
    where: { id: membershipId },
    data: { role: newRole },
  })
}

export async function updateMembershipPermissionOverrides(
  membershipId: string,
  overrides: Record<string, boolean> | null,
) {
  return db.membership.update({
    where: { id: membershipId },
    data: { permissionOverrides: overrides ?? undefined },
  })
}

/**
 * Hard-deletes a Membership (user removed from agency). Same
 * at-least-one-admin guard applies if removing the only admin.
 */
export async function deleteMembership(membershipId: string) {
  const current = await db.membership.findUnique({ where: { id: membershipId } })
  if (!current) throw new Error('Membership not found')

  if (current.role === 'admin') {
    const otherAdminCount = await db.membership.count({
      where: {
        organizationId: current.organizationId,
        role: 'admin',
        id: { not: membershipId },
      },
    })
    if (otherAdminCount === 0) {
      throw new Error(
        'Cannot remove the last admin of this agency. Promote someone else first.',
      )
    }
  }

  return db.membership.delete({ where: { id: membershipId } })
}
