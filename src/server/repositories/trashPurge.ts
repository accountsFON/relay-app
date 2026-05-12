import { db } from '@/db/client'
import { can } from '@/server/auth/permissions'
import { writeTrashAudit, type TrashEntityType } from '@/server/repositories/trashAuditLogs'
import type { UserRole } from '@/lib/types'

// ---------------------------------------------------------------------------
// Permission gate
// ---------------------------------------------------------------------------

/**
 * Checks that `actorUserId` holds an org membership with `admin.portal`
 * permission. `admin.portal` is the most restrictive built-in permission key —
 * it is true only for the `admin` role by default (account_manager, designer,
 * and client are all false). There is no explicit "Org Owner" role in the
 * Membership schema; `admin` is the most-privileged role, and `admin.portal`
 * is exclusively theirs unless an org explicitly overrides it.
 *
 * Permanent deletion is more destructive than archive/restore, so we require
 * admin-level access rather than the broader `run.delete` / `client.edit`
 * gates used elsewhere in the trash flow.
 */
async function assertIsOrgAdmin(
  actorUserId: string,
  organizationId: string,
): Promise<void> {
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
    'admin.portal',
  )
  if (!allowed) {
    throw new Error(
      `Forbidden: user ${actorUserId} (role: ${membership.role}) — only Org Admins can permanently delete`,
    )
  }
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface PurgeInput {
  entityType: TrashEntityType
  entityId: string
  actorUserId: string
}

/**
 * Permanently hard-deletes an archived entity and all of its descendants.
 *
 * **Org Admin only** — uses the `admin.portal` permission gate, the most
 * restrictive built-in key (admin role exclusively).
 *
 * Entity behaviour per type:
 *
 * - **post**: Simple delete (leaf node). cascadeCount = 1.
 *
 * - **contentRun**: Delete cascades to Posts via the DB FK
 *   (`ContentRun → Post` is Cascade). cascadeCount = 1 + postCount.
 *
 * - **batch**: MANUAL cascade. `Post.batchId` is SetNull (not Cascade), so
 *   `db.batch.delete()` alone would orphan Posts. We explicitly
 *   `deleteMany` Posts where `batchId = X AND deletedAt = priorDeletedAt`,
 *   then `deleteMany` ContentRuns that were archived as part of the same
 *   cascade (matched by timestamp + having posts in the batch), then delete
 *   the Batch. cascadeCount = 1 + runCount + postCount.
 *
 * - **client**: Full FK cascade handles all children (`Client → Batch`,
 *   `Client → ContentRun`, `Client → Post` are all Cascade). We count ALL
 *   children (not just timestamp-matched ones) because the FK cascade will
 *   delete them regardless of soft-delete state. cascadeCount = 1 + batches
 *   + runs + posts.
 */
export async function purgeEntity({
  entityType,
  entityId,
  actorUserId,
}: PurgeInput): Promise<void> {
  switch (entityType) {
    case 'post':
      return purgePost(entityId, actorUserId)
    case 'contentRun':
      return purgeContentRun(entityId, actorUserId)
    case 'batch':
      return purgeBatch(entityId, actorUserId)
    case 'client':
      return purgeClient(entityId, actorUserId)
    default: {
      const exhaustive: never = entityType
      throw new Error(`Unknown entityType: ${exhaustive}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Per-entity purge implementations
// ---------------------------------------------------------------------------

async function purgePost(postId: string, actorUserId: string): Promise<void> {
  // Two-query pattern: withArchived() + include errors, so load separately.
  const post = await db.post.withArchived().findFirst({ where: { id: postId } })
  if (!post) throw new Error(`Post ${postId} not found`)
  if (!post.deletedAt) throw new Error(`Post ${postId} is not archived — cannot purge a live row`)

  const client = await db.client.withArchived().findFirst({ where: { id: post.clientId } })
  if (!client) throw new Error(`Client ${post.clientId} not found for Post ${postId}`)

  const organizationId = client.organizationId
  await assertIsOrgAdmin(actorUserId, organizationId)

  await db.$transaction(async (tx) => {
    await tx.post.delete({ where: { id: postId } })
    await writeTrashAudit(tx, {
      actorUserId,
      organizationId,
      action: 'purge',
      entityType: 'post',
      entityId: postId,
      parentContext: {
        clientId: post.clientId,
        ...(post.batchId ? { batchId: post.batchId } : {}),
      },
      cascadeCount: 1,
    })
  })
}

async function purgeContentRun(runId: string, actorUserId: string): Promise<void> {
  // Two-query pattern.
  const run = await db.contentRun.withArchived().findFirst({ where: { id: runId } })
  if (!run) throw new Error(`ContentRun ${runId} not found`)
  if (!run.deletedAt)
    throw new Error(`ContentRun ${runId} is not archived — cannot purge a live row`)

  const client = await db.client.withArchived().findFirst({ where: { id: run.clientId } })
  if (!client) throw new Error(`Client ${run.clientId} not found for ContentRun ${runId}`)

  const organizationId = client.organizationId
  await assertIsOrgAdmin(actorUserId, organizationId)

  // Pre-count posts under the run (FK cascade will delete them, so count before).
  const postCount = await db.post.withArchived().count({ where: { contentRunId: runId } })

  await db.$transaction(async (tx) => {
    // FK cascade (ContentRun → Post is Cascade) deletes Posts automatically.
    await tx.contentRun.delete({ where: { id: runId } })
    await writeTrashAudit(tx, {
      actorUserId,
      organizationId,
      action: 'purge',
      entityType: 'contentRun',
      entityId: runId,
      parentContext: { clientId: run.clientId },
      cascadeCount: 1 + postCount,
    })
  })
}

async function purgeBatch(batchId: string, actorUserId: string): Promise<void> {
  // Two-query pattern.
  const batch = await db.batch.withArchived().findFirst({ where: { id: batchId } })
  if (!batch) throw new Error(`Batch ${batchId} not found`)
  if (!batch.deletedAt)
    throw new Error(`Batch ${batchId} is not archived — cannot purge a live row`)

  const client = await db.client.withArchived().findFirst({ where: { id: batch.clientId } })
  if (!client) throw new Error(`Client ${batch.clientId} not found for Batch ${batchId}`)

  const organizationId = client.organizationId
  await assertIsOrgAdmin(actorUserId, organizationId)

  // Capture the cascade timestamp used when this batch was archived so we can
  // identify which Posts and ContentRuns were archived as part of this batch's
  // cascade (as opposed to independently-archived rows at a different timestamp).
  const priorDeletedAt = batch.deletedAt

  // Pre-count and pre-collect rows that will be explicitly deleted.
  // Posts: batchId = X AND deletedAt = priorDeletedAt (cascade-archived posts only).
  const postCount = await db.post
    .withArchived()
    .count({ where: { batchId, deletedAt: priorDeletedAt } })

  // Runs: archived at same timestamp AND have at least one post in this batch.
  // These are the ContentRuns stamped by archiveBatch's cascade.
  // We collect IDs here (outside the transaction) because after we deleteMany
  // the Posts inside the transaction, the `posts: { some: { batchId } }` filter
  // would no longer match (the posts are gone) — so we must capture run IDs first.
  const affectedRuns = await db.contentRun.withArchived().findMany({
    where: {
      deletedAt: priorDeletedAt,
      posts: { some: { batchId } },
    },
    select: { id: true },
  })
  const runIds = affectedRuns.map((r) => r.id)
  const runCount = runIds.length

  await db.$transaction(async (tx) => {
    // 1. Explicitly delete cascade-archived Posts.
    //    Post.batchId is SetNull, not Cascade — db.batch.delete() alone would
    //    null out batchId instead of deleting the Posts. We must do this manually.
    await tx.post.deleteMany({ where: { batchId, deletedAt: priorDeletedAt } })

    // 2. Explicitly delete cascade-archived ContentRuns by pre-collected ID list.
    //    We use IDs instead of the `posts: { some: { batchId } }` filter because
    //    the Posts were already deleted in step 1 and the filter would miss them.
    if (runIds.length > 0) {
      await tx.contentRun.deleteMany({
        where: { id: { in: runIds } },
      })
    }

    // 3. Delete the Batch itself.
    await tx.batch.delete({ where: { id: batchId } })

    await writeTrashAudit(tx, {
      actorUserId,
      organizationId,
      action: 'purge',
      entityType: 'batch',
      entityId: batchId,
      parentContext: { clientId: batch.clientId },
      cascadeCount: 1 + runCount + postCount,
    })
  })
}

async function purgeClient(clientId: string, actorUserId: string): Promise<void> {
  // Two-query pattern.
  const client = await db.client.withArchived().findFirst({ where: { id: clientId } })
  if (!client) throw new Error(`Client ${clientId} not found`)
  if (!client.deletedAt)
    throw new Error(`Client ${clientId} is not archived — cannot purge a live row`)

  const organizationId = client.organizationId
  await assertIsOrgAdmin(actorUserId, organizationId)

  // Pre-count ALL children (not just timestamp-matched) because the FK cascade
  // deletes every child regardless of their soft-delete state. Counting all
  // children gives the most accurate audit record of what was actually removed.
  const [batchCount, runCount, postCount] = await Promise.all([
    db.batch.withArchived().count({ where: { clientId } }),
    db.contentRun.withArchived().count({ where: { clientId } }),
    db.post.withArchived().count({ where: { clientId } }),
  ])

  await db.$transaction(async (tx) => {
    // FK cascade (Client → Batch, Client → ContentRun, Client → Post are all
    // Cascade) deletes all children automatically.
    await tx.client.delete({ where: { id: clientId } })

    await writeTrashAudit(tx, {
      actorUserId,
      organizationId,
      action: 'purge',
      entityType: 'client',
      entityId: clientId,
      parentContext: {},
      cascadeCount: 1 + batchCount + runCount + postCount,
    })
  })
}
