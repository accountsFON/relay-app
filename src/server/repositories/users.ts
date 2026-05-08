import { db } from '@/db/client'
import type { UserRole } from '@/lib/types'

export async function findUserByClerkId(clerkUserId: string) {
  return db.user.findUnique({
    where: { clerkUserId },
  })
}

export async function createUser(input: {
  clerkUserId: string
  organizationId: string
  email: string
  name: string
  role: UserRole
}) {
  return db.user.create({
    data: {
      clerkUserId: input.clerkUserId,
      organizationId: input.organizationId,
      email: input.email,
      name: input.name,
      role: input.role,
    },
  })
}

/**
 * Admin-only: fetch a single user with their Membership and client
 * assignments scoped to the active org. Returns null if the user has
 * no Membership in this org.
 */
export async function findUserWithMembershipInOrg(
  userId: string,
  organizationId: string,
) {
  return db.user.findFirst({
    where: {
      id: userId,
      memberships: { some: { organizationId } },
    },
    include: {
      memberships: { where: { organizationId } },
      assignedClients: {
        where: { organizationId },
        select: { id: true, name: true },
      },
      designedClients: {
        where: { organizationId },
        select: { id: true, name: true },
      },
    },
  })
}

/**
 * Set or clear the platformOwner flag on a user. Only platform owners
 * should be able to call this; the action that wraps it must guard.
 */
export async function setUserPlatformOwner(userId: string, value: boolean) {
  return db.user.update({
    where: { id: userId },
    data: { platformOwner: value },
  })
}
