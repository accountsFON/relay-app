import { clerkClient } from '@clerk/nextjs/server'
import { db } from '@/db/client'
import {
  reassignUserOwnedRecords,
  countPlatformOwners,
} from '@/server/repositories/users'

/**
 * Thrown for any user-lifecycle service guard or failure. The action layer
 * surfaces the message to the admin; mirrors RelayServiceError in relay.ts.
 */
export class UserServiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserServiceError'
  }
}

/**
 * True when a Clerk backend error means "this user no longer exists". The
 * primary signal is HTTP 404; we also tolerate an error whose Clerk error
 * code clearly says not-found when `status` is absent, so a slightly different
 * SDK shape doesn't strand a row that can never be deleted.
 */
function isClerkNotFound(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const status = (err as { status?: number }).status
    if (status === 404) return true
    const errors = (err as { errors?: Array<{ code?: string }> }).errors
    const code = errors?.[0]?.code
    if (status == null && code && /not_found|resource_not_found/i.test(code)) {
      return true
    }
  }
  return false
}

/**
 * Soft-disable a user. Sets `deactivatedAt` and records an audit row. The
 * auth gate and assignment pickers exclude deactivated users. You cannot
 * deactivate yourself.
 */
export async function deactivateUser(input: {
  userId: string
  actorId: string
  actorOrganizationId: string
}) {
  if (input.userId === input.actorId) {
    throw new UserServiceError('You cannot deactivate your own account.')
  }
  return db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: input.userId },
      data: { deactivatedAt: new Date() },
    })
    await tx.permissionAuditLog.create({
      data: {
        organizationId: input.actorOrganizationId,
        actorUserId: input.actorId,
        targetUserId: input.userId,
        permissionKey: 'user.deactivated',
        usedPlatformOverride: false,
      },
    })
    return { userId: input.userId, deactivated: true }
  })
}

/**
 * Reverse a deactivation. Clears `deactivatedAt` and records an audit row.
 */
export async function reactivateUser(input: {
  userId: string
  actorId: string
  actorOrganizationId: string
}) {
  return db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: input.userId },
      data: { deactivatedAt: null },
    })
    await tx.permissionAuditLog.create({
      data: {
        organizationId: input.actorOrganizationId,
        actorUserId: input.actorId,
        targetUserId: input.userId,
        permissionKey: 'user.reactivated',
        usedPlatformOverride: false,
      },
    })
    return { userId: input.userId, deactivated: false }
  })
}

/**
 * Permanently remove a user. The target must already be deactivated. All
 * Restrict-FK records they own are reassigned to `reassignToUserId` first.
 *
 * Ordering is deliberate and load-bearing:
 *   1. Guard + validate (self, reassign-to-self, exists, deactivated, last
 *      owner, valid active reassign target).
 *   2. Phase 1 (txn): reassign owned records + write the hard-delete audit
 *      row. The audit row uses `targetUserId: null` because the AuditTarget
 *      FK is Restrict and would otherwise block the delete; the email is
 *      embedded in `permissionKey` for the trail.
 *   3. Phase 2 (outside txn): delete the Clerk identity. A 404 is tolerated
 *      (identity already gone). ANY other failure throws BEFORE the row delete
 *      so we never leave a DB row whose Clerk identity still exists.
 *   4. Phase 3: delete the DB row.
 */
export async function hardDeleteUser(input: {
  userId: string
  reassignToUserId: string
  actorId: string
  actorOrganizationId: string
}) {
  if (input.userId === input.actorId) {
    throw new UserServiceError('You cannot delete your own account.')
  }
  if (input.reassignToUserId === input.userId) {
    throw new UserServiceError('Choose a different user to reassign to.')
  }

  const target = await db.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      email: true,
      clerkUserId: true,
      platformOwner: true,
      deactivatedAt: true,
    },
  })
  if (!target) throw new UserServiceError('User not found.')
  if (target.deactivatedAt == null) {
    throw new UserServiceError('Deactivate the user before deleting.')
  }
  if (target.platformOwner) {
    const owners = await countPlatformOwners()
    if (owners <= 1) {
      throw new UserServiceError('Cannot delete the last platform owner.')
    }
  }

  const reassignTarget = await db.user.findUnique({
    where: { id: input.reassignToUserId },
    select: { id: true, deactivatedAt: true },
  })
  if (!reassignTarget || reassignTarget.deactivatedAt != null) {
    throw new UserServiceError('Reassignment target is not a valid active user.')
  }

  // Phase 1: reassign + audit, atomically.
  await db.$transaction(async (tx) => {
    await reassignUserOwnedRecords(tx, input.userId, input.reassignToUserId)
    await tx.permissionAuditLog.create({
      data: {
        organizationId: input.actorOrganizationId,
        actorUserId: input.actorId,
        targetUserId: null,
        permissionKey: `user.hard_deleted:${target.email}`,
        usedPlatformOverride: true,
      },
    })
  })

  // Phase 2: Clerk delete, outside the txn. 404-tolerant; non-404 aborts
  // BEFORE the row delete.
  let clerkDeleted = true
  try {
    const clerk = await clerkClient()
    await clerk.users.deleteUser(target.clerkUserId)
  } catch (err) {
    if (isClerkNotFound(err)) {
      clerkDeleted = false
    } else {
      throw new UserServiceError(
        'Failed to delete the Clerk identity; the user was reassigned and remains deactivated. Retry to finish.',
      )
    }
  }

  // Phase 3: delete the DB row.
  await db.user.delete({ where: { id: input.userId } })

  return {
    deletedUserId: input.userId,
    reassignedToUserId: input.reassignToUserId,
    clerkDeleted,
  }
}
