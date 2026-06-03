import { db } from '@/db/client'
import type { DbTx } from '@/db/client'
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
      deactivatedAt: null,
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

/**
 * Set or clear the deactivation timestamp on a user. A non-null
 * `deactivatedAt` marks the account as deactivated (soft disable); the
 * auth gate and assignment pickers exclude these users.
 */
export async function setUserDeactivated(userId: string, value: boolean) {
  return db.user.update({
    where: { id: userId },
    data: { deactivatedAt: value ? new Date() : null },
  })
}

/**
 * Count every record that points at `userId` via a Restrict FK, scoped
 * to the org where the scoping field exists. Used to warn an admin (and
 * gate hard delete) before removing a user, since these rows would block
 * the delete otherwise.
 */
export async function countUserOwnedRecords(
  userId: string,
  organizationId: string,
) {
  const [
    heldBatches,
    assignedAmClients,
    assignedDesignerClients,
    triggeredRuns,
    createdMagicLinks,
  ] = await Promise.all([
    db.batch.count({ where: { currentHolder: userId } }),
    db.client.count({ where: { assignedAmId: userId, organizationId } }),
    db.client.count({ where: { assignedDesignerId: userId, organizationId } }),
    db.contentRun.count({ where: { triggeredById: userId } }),
    db.magicLink.count({ where: { createdBy: userId } }),
  ])
  return {
    heldBatches,
    assignedAmClients,
    assignedDesignerClients,
    triggeredRuns,
    createdMagicLinks,
  }
}

/**
 * List active (non-deactivated) users in an org, excluding one user.
 * Powers reassignment pickers so a departing user cannot be chosen as
 * the new owner of their own records.
 */
export async function listActiveAssignableUsers(
  organizationId: string,
  excludeUserId: string,
) {
  return db.user.findMany({
    where: {
      deactivatedAt: null,
      id: { not: excludeUserId },
      memberships: { some: { organizationId } },
    },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: 'asc' },
  })
}

/**
 * Count platform owners. Used to block deactivating or deleting the last
 * platform owner.
 */
export async function countPlatformOwners() {
  return db.user.count({ where: { platformOwner: true } })
}

/**
 * Orgs where `userId` is an admin and there is no OTHER active (non
 * deactivated) admin. Closing this account would leave each of these orgs
 * with no one who can manage it, so the self deactivation guard blocks on a
 * non empty result. Returns the org id + name so the caller can name the
 * agency in the block message.
 */
export async function findOrgsWhereLastActiveAdmin(
  userId: string,
): Promise<{ id: string; name: string }[]> {
  const adminMemberships = await db.membership.findMany({
    where: { userId, role: 'admin' },
    include: { organization: { select: { id: true, name: true } } },
  })
  const orphaned: { id: string; name: string }[] = []
  for (const m of adminMemberships) {
    const otherActiveAdmins = await db.membership.count({
      where: {
        organizationId: m.organizationId,
        role: 'admin',
        userId: { not: userId },
        user: { deactivatedAt: null },
      },
    })
    if (otherActiveAdmins === 0) orphaned.push(m.organization)
  }
  return orphaned
}

/**
 * Move every Restrict FK off `fromUserId` onto `toUserId`, and null any
 * audit rows that point at `fromUserId` as target (the AuditTarget FK is
 * Restrict and would otherwise block the row delete). Must run inside the
 * caller's transaction.
 */
export async function reassignUserOwnedRecords(
  tx: DbTx,
  fromUserId: string,
  toUserId: string,
) {
  await tx.batch.updateMany({
    where: { currentHolder: fromUserId },
    data: { currentHolder: toUserId },
  })
  await tx.client.updateMany({
    where: { assignedAmId: fromUserId },
    data: { assignedAmId: toUserId },
  })
  await tx.client.updateMany({
    where: { assignedDesignerId: fromUserId },
    data: { assignedDesignerId: toUserId },
  })
  await tx.contentRun.updateMany({
    where: { triggeredById: fromUserId },
    data: { triggeredById: toUserId },
  })
  await tx.magicLink.updateMany({
    where: { createdBy: fromUserId },
    data: { createdBy: toUserId },
  })
  await tx.permissionAuditLog.updateMany({
    where: { actorUserId: fromUserId },
    data: { actorUserId: toUserId },
  })
  await tx.permissionAuditLog.updateMany({
    where: { targetUserId: fromUserId },
    data: { targetUserId: null },
  })
}
