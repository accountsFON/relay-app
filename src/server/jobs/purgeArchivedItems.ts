import { schedules, logger } from '@trigger.dev/sdk/v3'
import { db } from '@/db/client'
import { writeTrashAudit, type TrashEntityType } from '@/server/repositories/trashAuditLogs'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PURGE_DAYS = 30
const SYSTEM_ACTOR = 'system:purgeArchivedItems'

// ---------------------------------------------------------------------------
// Inner run logic, exported separately so integration tests can call it
// directly without needing the Trigger.dev harness.
// ---------------------------------------------------------------------------

export interface PurgeRunResult {
  ok: boolean
  totals: {
    clients: number
    batches: number
    runs: number
    posts: number
  }
}

export interface PurgeRunOptions {
  /** Override the current time (useful for testing). */
  now?: Date
  /**
   * Restrict the purge to specific organizations. Used only in tests to
   * prevent a globally-scoped purge run from deleting fixtures belonging to
   * concurrently-running integration tests.
   *
   * @internal Do not use in production code.
   */
  _testOrganizationIds?: string[]
}

export async function runPurgeArchivedItems(
  options: PurgeRunOptions = {},
): Promise<PurgeRunResult> {
  const now = options.now ?? new Date()
  const cutoff = new Date(now.getTime() - PURGE_DAYS * 86_400_000)
  const orgFilter =
    options._testOrganizationIds && options._testOrganizationIds.length > 0
      ? { client: { organizationId: { in: options._testOrganizationIds } } }
      : {}

  // -------------------------------------------------------------------------
  // Step 1: Collect clients to purge
  // -------------------------------------------------------------------------
  const clientsToPurge = await db.client.onlyArchived().findMany({
    where: {
      deletedAt: { lt: cutoff },
      ...(options._testOrganizationIds && options._testOrganizationIds.length > 0
        ? { organizationId: { in: options._testOrganizationIds } }
        : {}),
    },
    select: { id: true, organizationId: true },
  })
  const clientIds = clientsToPurge.map((c) => c.id)

  // -------------------------------------------------------------------------
  // Step 2: Collect batches to purge (skip those under a purging client,
  // the FK cascade on Client will handle them automatically)
  // -------------------------------------------------------------------------
  const batchesToPurge = await db.batch.onlyArchived().findMany({
    where: {
      deletedAt: { lt: cutoff },
      ...(clientIds.length > 0 ? { clientId: { notIn: clientIds } } : {}),
      ...orgFilter,
    },
    select: { id: true, client: { select: { organizationId: true } } },
  })
  const batchIds = batchesToPurge.map((b) => b.id)

  // -------------------------------------------------------------------------
  // Step 3: Collect runs to purge (skip those under a purging client)
  // -------------------------------------------------------------------------
  const runsToPurge = await db.contentRun.onlyArchived().findMany({
    where: {
      deletedAt: { lt: cutoff },
      ...(clientIds.length > 0 ? { clientId: { notIn: clientIds } } : {}),
      ...orgFilter,
    },
    select: { id: true, client: { select: { organizationId: true } } },
  })
  const runIds = runsToPurge.map((r) => r.id)

  // -------------------------------------------------------------------------
  // Step 4: Collect posts to purge (skip those whose parent will cascade-delete
  // them: client in step 1, batch in step 2, run in step 3)
  // -------------------------------------------------------------------------
  const postsToPurge = await db.post.onlyArchived().findMany({
    where: {
      deletedAt: { lt: cutoff },
      ...(clientIds.length > 0 ? { clientId: { notIn: clientIds } } : {}),
      // Posts under a purging batch need to be handled by the batch cascade
      // logic below, not here (their batchId will be nulled by SetNull if we
      // skip them, but we delete them explicitly in the batch block instead).
      ...(batchIds.length > 0 ? { batchId: { notIn: batchIds } } : {}),
      ...(runIds.length > 0 ? { contentRunId: { notIn: runIds } } : {}),
      ...orgFilter,
    },
    select: { id: true, client: { select: { organizationId: true } } },
  })

  logger.info('purge plan', {
    clients: clientsToPurge.length,
    batches: batchesToPurge.length,
    runs: runsToPurge.length,
    posts: postsToPurge.length,
  })

  // -------------------------------------------------------------------------
  // Execute deletes, top-down so FK cascades cover descendants where possible
  // -------------------------------------------------------------------------

  // 1. Clients: FK cascades to Batch, ContentRun, Post automatically.
  if (clientIds.length > 0) {
    await db.client.deleteMany({ where: { id: { in: clientIds } } })
  }

  // 2. Batches: MANUAL cascade because Post.batchId is SetNull (not Cascade).
  //    Delete the posts that belong to these batches first, then the batches.
  //    Note: these posts were excluded from step 4's collection precisely so
  //    they are handled here.
  if (batchIds.length > 0) {
    await db.post.deleteMany({ where: { batchId: { in: batchIds } } })
    await db.batch.deleteMany({ where: { id: { in: batchIds } } })
  }

  // 3. ContentRuns: FK cascade to Post (Run → Post is Cascade).
  if (runIds.length > 0) {
    await db.contentRun.deleteMany({ where: { id: { in: runIds } } })
  }

  // 4. Standalone posts (not covered by any of the above cascades).
  const postIds = postsToPurge.map((p) => p.id)
  if (postIds.length > 0) {
    await db.post.deleteMany({ where: { id: { in: postIds } } })
  }

  // -------------------------------------------------------------------------
  // Audit: one entry per (orgId, entityType) tuple to avoid spamming the log
  // -------------------------------------------------------------------------

  const rollups = new Map<string, { orgId: string; entityType: TrashEntityType; count: number }>()

  const bump = (orgId: string, et: TrashEntityType) => {
    const key = `${orgId}:${et}`
    const cur = rollups.get(key) ?? { orgId, entityType: et, count: 0 }
    cur.count += 1
    rollups.set(key, cur)
  }

  for (const c of clientsToPurge) bump(c.organizationId, 'client')
  for (const b of batchesToPurge) bump(b.client.organizationId, 'batch')
  for (const r of runsToPurge) bump(r.client.organizationId, 'contentRun')
  for (const p of postsToPurge) bump(p.client.organizationId, 'post')

  const runStamp = now.toISOString()

  for (const { orgId, entityType, count } of rollups.values()) {
    await writeTrashAudit(db, {
      actorUserId: SYSTEM_ACTOR,
      organizationId: orgId,
      action: 'purge',
      entityType,
      entityId: `system:scheduled-purge:${runStamp}`,
      parentContext: { rollup: true, runAt: runStamp },
      cascadeCount: count,
    })
  }

  return {
    ok: true,
    totals: {
      clients: clientsToPurge.length,
      batches: batchesToPurge.length,
      runs: runsToPurge.length,
      posts: postsToPurge.length,
    },
  }
}

// ---------------------------------------------------------------------------
// Trigger.dev scheduled task wrapper
// ---------------------------------------------------------------------------

export const purgeArchivedItemsTask = schedules.task({
  id: 'purge-archived-items',
  cron: '0 3 * * *', // daily at 03:00 UTC
  run: () => runPurgeArchivedItems({}),
})
