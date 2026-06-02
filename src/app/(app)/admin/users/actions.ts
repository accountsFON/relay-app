'use server'

import { revalidatePath } from 'next/cache'

import { requireCan } from '@/server/middleware/permissions'
import { findUserWithMembershipInOrg } from '@/server/repositories/users'
import {
  deactivateUser,
  reactivateUser,
  hardDeleteUser,
} from '@/server/services/users'

/**
 * Org-scope guard. The target user must be a member of the actor's
 * organization, otherwise we treat them as nonexistent (no cross-tenant
 * leakage of which user ids are valid).
 */
async function assertTargetInOrg(userId: string, organizationDbId: string) {
  const target = await findUserWithMembershipInOrg(userId, organizationDbId)
  if (!target) throw new Error('User not found')
}

export async function deactivateUserAction(input: { userId: string }) {
  const ctx = await requireCan('user.deactivate')
  await assertTargetInOrg(input.userId, ctx.organizationDbId)
  const result = await deactivateUser({
    userId: input.userId,
    actorId: ctx.userDbId,
    actorOrganizationId: ctx.organizationDbId,
  })
  revalidatePath('/admin/users')
  revalidatePath(`/admin/users/${input.userId}`)
  return result
}

export async function reactivateUserAction(input: { userId: string }) {
  const ctx = await requireCan('user.deactivate')
  await assertTargetInOrg(input.userId, ctx.organizationDbId)
  const result = await reactivateUser({
    userId: input.userId,
    actorId: ctx.userDbId,
    actorOrganizationId: ctx.organizationDbId,
  })
  revalidatePath('/admin/users')
  revalidatePath(`/admin/users/${input.userId}`)
  return result
}

export async function hardDeleteUserAction(input: {
  userId: string
  reassignToUserId: string
}) {
  const ctx = await requireCan('user.hardDelete')
  if (ctx.platformOwner !== true) {
    throw new Error('Only a platform owner can permanently delete a user.')
  }
  await assertTargetInOrg(input.userId, ctx.organizationDbId)
  const result = await hardDeleteUser({
    userId: input.userId,
    reassignToUserId: input.reassignToUserId,
    actorId: ctx.userDbId,
    actorOrganizationId: ctx.organizationDbId,
  })
  revalidatePath('/admin/users')
  return result
}
