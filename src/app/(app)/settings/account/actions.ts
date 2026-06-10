'use server'

import { clerkClient } from '@clerk/nextjs/server'
import { del } from '@vercel/blob'
import { revalidatePath } from 'next/cache'

import { db } from '@/db/client'
import { isOwnAvatarBlobUrl } from '@/lib/avatar'
import { requireOrgContext } from '@/server/middleware/auth'
import { selfDeactivateUser } from '@/server/services/users'

/**
 * Close (self deactivate) the current user's own account. No permission key:
 * any signed in user may act on their own account. The guard inside
 * selfDeactivateUser blocks the last admin / last platform owner. The client
 * signs the user out on success.
 */
export async function closeMyAccountAction() {
  const ctx = await requireOrgContext()
  return selfDeactivateUser({
    actorId: ctx.userDbId,
    actorOrganizationId: ctx.organizationDbId,
    actorIsPlatformOwner: ctx.platformOwner,
  })
}

/** Best-effort: never throws. Pushes the avatar image to Clerk so the
 *  header <UserButton/> matches. */
async function syncAvatarToClerk(clerkUserId: string, blobUrl: string): Promise<void> {
  try {
    const res = await fetch(blobUrl)
    const file = await res.blob()
    const client = await clerkClient()
    await client.users.updateUserProfileImage(clerkUserId, { file })
  } catch (err) {
    console.error('[avatar] clerk image sync failed (non-fatal):', err)
  }
}

async function bestEffortDel(url: string | null | undefined): Promise<void> {
  if (!url) return
  try {
    await del(url)
  } catch (err) {
    console.error('[avatar] blob delete failed (non-fatal):', err)
  }
}

/**
 * Set the current user's avatar to an already-uploaded blob URL. Rejects any
 * URL that is not a Vercel Blob host under THIS user's own prefix, so a user
 * cannot point their avatar at an arbitrary URL or another user's blob.
 */
export async function updateMyAvatarAction(blobUrl: string) {
  const ctx = await requireOrgContext()
  if (!isOwnAvatarBlobUrl(blobUrl, ctx.userDbId)) {
    throw new Error('Invalid avatar URL')
  }
  const prior = await db.user.findUnique({
    where: { id: ctx.userDbId },
    select: { avatarUrl: true },
  })
  await db.user.update({ where: { id: ctx.userDbId }, data: { avatarUrl: blobUrl } })
  if (prior?.avatarUrl && prior.avatarUrl !== blobUrl) {
    await bestEffortDel(prior.avatarUrl)
  }
  await syncAvatarToClerk(ctx.userId, blobUrl)
  revalidatePath('/settings/account')
  return { avatarUrl: blobUrl }
}

/** Clear the current user's avatar (revert to initials) + clear Clerk image. */
export async function removeMyAvatarAction() {
  const ctx = await requireOrgContext()
  const prior = await db.user.findUnique({
    where: { id: ctx.userDbId },
    select: { avatarUrl: true },
  })
  await db.user.update({ where: { id: ctx.userDbId }, data: { avatarUrl: null } })
  await bestEffortDel(prior?.avatarUrl)
  try {
    const client = await clerkClient()
    await client.users.deleteUserProfileImage(ctx.userId)
  } catch (err) {
    console.error('[avatar] clerk image clear failed (non-fatal):', err)
  }
  revalidatePath('/settings/account')
  return { avatarUrl: null }
}
