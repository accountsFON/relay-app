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

export interface AdminRecipient {
  id: string
  name: string
  email: string
}

/**
 * Returns every user that should receive operational broadcasts (today,
 * the in app feedback digest + urgent alerts). Includes both
 * `role = admin` and `platformOwner = true` so platform owners with a
 * non admin org role still get the email. De-duped by email so a user
 * who is both does not get two copies.
 *
 * Used by the sendFeedbackDigest cron + submitFeedbackAction urgent
 * path. Scoped queries (per-org admins) belong in a separate helper.
 */
export async function findAdminRecipients(): Promise<AdminRecipient[]> {
  const rows = await db.user.findMany({
    where: {
      OR: [{ role: 'admin' }, { platformOwner: true }],
    },
    select: { id: true, name: true, email: true },
    orderBy: { email: 'asc' },
  })
  const seen = new Set<string>()
  const out: AdminRecipient[] = []
  for (const r of rows) {
    if (!r.email) continue
    const key = r.email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ id: r.id, name: r.name, email: r.email })
  }
  return out
}
