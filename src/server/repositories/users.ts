import { db } from '@/db/client'
import type { UserRole } from '@/lib/types'

export async function findUserByClerkId(clerkUserId: string) {
  return db.user.findUnique({
    where: { clerkUserId },
    include: {
      organization: {
        include: { roleDefaults: true },
      },
    },
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

/** Admin-only: lists all users in the org with assignment counts. */
export async function listUsersByOrg(organizationId: string) {
  return db.user.findMany({
    where: { organizationId },
    include: {
      _count: {
        select: {
          assignedClients: true,
          designedClients: true,
        },
      },
    },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  })
}

/** Admin-only: fetch a single user in the org for the admin portal. */
export async function findUserInOrg(userId: string, organizationId: string) {
  return db.user.findFirst({
    where: { id: userId, organizationId },
    include: {
      assignedClients: { select: { id: true, name: true } },
      designedClients: { select: { id: true, name: true } },
    },
  })
}

export async function updateUserRole(
  userId: string,
  organizationId: string,
  role: UserRole,
) {
  return db.user.updateMany({
    where: { id: userId, organizationId },
    data: { role },
  })
}

export async function updateUserPermissionOverrides(
  userId: string,
  organizationId: string,
  overrides: Record<string, boolean> | null,
) {
  return db.user.updateMany({
    where: { id: userId, organizationId },
    data: { permissionOverrides: overrides ?? undefined },
  })
}
