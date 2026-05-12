import { db } from '@/db/client'
import { writeTrashAudit } from '@/server/repositories/trashAuditLogs'
import { can } from '@/server/auth/permissions'
import type { UserRole } from '@/lib/types'

/**
 * Checks that `actorUserId` holds an org membership for the given
 * `organizationId` AND that the membership role has `post.edit` permission.
 *
 * Throws a permission error if the membership is missing or the role does not
 * allow `post.edit`. This mirrors the existing `requireClientEditor()` gate
 * used in server actions, but works directly with a DB user ID so it can be
 * called from repository functions that do not have a Clerk session context.
 */
async function assertCanEditPost(actorUserId: string, organizationId: string): Promise<void> {
  const membership = await db.membership.findUnique({
    where: { userId_organizationId: { userId: actorUserId, organizationId } },
  })
  if (!membership) {
    throw new Error(
      `Not authorized: user ${actorUserId} has no membership in organization ${organizationId}`,
    )
  }
  const allowed = can(
    {
      role: membership.role as UserRole,
      permissionOverrides:
        (membership.permissionOverrides as Record<string, boolean> | null) ?? null,
    },
    'post.edit',
  )
  if (!allowed) {
    throw new Error(
      `Forbidden: user ${actorUserId} (role: ${membership.role}) does not have post.edit permission`,
    )
  }
}

export interface PostArchiveInput {
  postId: string
  actorUserId: string
}

export async function archivePost({ postId, actorUserId }: PostArchiveInput): Promise<void> {
  // Load the post (including archived) then load the client separately.
  // withArchived().findFirst() + include causes a Prisma invocation error
  // (the soft-delete proxy and the include option do not compose cleanly),
  // so we do two separate queries.
  const post = await db.post.withArchived().findFirst({ where: { id: postId } })
  if (!post) throw new Error(`Post ${postId} not found`)
  if (post.deletedAt) throw new Error(`Post ${postId} is already archived`)

  const client = await db.client.withArchived().findFirst({ where: { id: post.clientId } })
  if (!client) throw new Error(`Client ${post.clientId} not found for post ${postId}`)

  const organizationId = client.organizationId
  await assertCanEditPost(actorUserId, organizationId)

  const now = new Date()
  await db.$transaction(async (tx) => {
    await tx.post.update({
      where: { id: postId },
      data: { deletedAt: now, deletedBy: actorUserId },
    })
    await writeTrashAudit(tx, {
      actorUserId,
      organizationId,
      action: 'archive',
      entityType: 'post',
      entityId: postId,
      parentContext: { clientId: post.clientId, ...(post.batchId ? { batchId: post.batchId } : {}) },
      cascadeCount: 1,
    })
  })
}

export async function restorePost({ postId, actorUserId }: PostArchiveInput): Promise<void> {
  // Two-query pattern — same reason as archivePost above.
  const post = await db.post.withArchived().findFirst({ where: { id: postId } })
  if (!post) throw new Error(`Post ${postId} not found`)
  if (!post.deletedAt) throw new Error(`Post ${postId} is not archived`)

  const client = await db.client.withArchived().findFirst({ where: { id: post.clientId } })
  if (!client) throw new Error(`Client ${post.clientId} not found for post ${postId}`)

  const organizationId = client.organizationId
  await assertCanEditPost(actorUserId, organizationId)

  await db.$transaction(async (tx) => {
    await tx.post.update({
      where: { id: postId },
      data: { deletedAt: null, deletedBy: null },
    })
    await writeTrashAudit(tx, {
      actorUserId,
      organizationId,
      action: 'restore',
      entityType: 'post',
      entityId: postId,
      parentContext: { clientId: post.clientId, ...(post.batchId ? { batchId: post.batchId } : {}) },
      cascadeCount: 1,
    })
  })
}

export async function findPostsByRun(contentRunId: string) {
  return db.post.findMany({
    where: { contentRunId },
    orderBy: { postDate: 'asc' },
  })
}

export async function findPostById(id: string) {
  return db.post.findUnique({ where: { id } })
}

export async function updatePost(
  id: string,
  data: {
    caption?: string
    hashtags?: string[]
    graphicHook?: string | null
    designerNotes?: string | null
  }
) {
  return db.post.update({ where: { id }, data })
}
