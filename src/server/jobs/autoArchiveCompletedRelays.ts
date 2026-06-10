import { logger } from '@trigger.dev/sdk/v3'
import { db } from '@/db/client'
import { writeTrashAudit } from '@/server/repositories/trashAuditLogs'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Days a relay sits in the `completed` step before the system auto-archives
 * it. Pairs with PURGE_DAYS (30) in purgeArchivedItems.ts, so the full
 * lifecycle from finish to permanent deletion is 37 + 30 = 67 days.
 *
 * Extending the window here (rather than PURGE_DAYS) keeps the
 * notifyImpendingPurge "7 days until permanent deletion" warning accurate,
 * since that job is tuned to the 30-day purge window.
 *
 * Per Phase 3 backlog brief Item 21, Julio default 2026-06-01; window
 * widened to 37 (67-day total) 2026-06-10.
 */
export const AUTO_ARCHIVE_DAYS = 37

/**
 * The timestamp before which a completed relay is past its archive window.
 * A batch whose `completedAt` is older than this gets swept into the archive.
 */
export function archiveCutoff(now: Date): Date {
  return new Date(now.getTime() - AUTO_ARCHIVE_DAYS * 86_400_000)
}

/**
 * System actor string written to TrashAuditLog so audit consumers can
 * distinguish system-driven archival from user-driven archival without
 * looking at the cascade pattern. Mirrors the SYSTEM_ACTOR convention
 * from purgeArchivedItems.ts.
 */
const SYSTEM_ACTOR = 'system:autoArchiveCompletedRelays'

// ---------------------------------------------------------------------------
// Inner run logic, exported separately so integration tests can call it
// directly without going through Trigger.dev. Also called by the existing
// purgeArchivedItems schedules.task wrapper so we share one cron firing
// time rather than registering a second schedule.
// ---------------------------------------------------------------------------

export interface AutoArchiveRunResult {
  ok: boolean
  totals: {
    batches: number
  }
}

export interface AutoArchiveRunOptions {
  /** Override the current time, useful for testing. */
  now?: Date
  /**
   * Restrict the run to specific organizations. Used only in tests to
   * prevent a globally-scoped run from archiving fixtures belonging to
   * concurrently-running integration tests.
   *
   * @internal Do not use in production code.
   */
  _testOrganizationIds?: string[]
}

/**
 * Sweeps every Batch at currentStep = 'completed' whose completedAt is
 * older than AUTO_ARCHIVE_DAYS and stamps deletedAt + deletedBy. Uses the
 * same soft-delete mechanism as the user-facing archiveBatchAction so the
 * trash UI surfaces auto-archived and manually archived batches
 * identically.
 *
 * Intentionally does NOT cascade the soft-delete down to Posts. Manual
 * archiveBatch cascades to Posts because the user explicitly chose to
 * remove the batch and its work; for a completed batch sitting past the
 * retention window we only need to clear it out of the dashboard kanban.
 * The purgeArchivedItems job will hard-delete the orphaned batch row
 * 30 days later.
 *
 * Writes one rolled-up TrashAuditLog entry per organization so audit
 * volume stays bounded even on large batch counts.
 */
export async function runAutoArchiveCompletedRelays(
  options: AutoArchiveRunOptions = {},
): Promise<AutoArchiveRunResult> {
  const now = options.now ?? new Date()
  const cutoff = archiveCutoff(now)

  // Find every live, completed batch past the retention window. We pull
  // the organizationId in the select so the audit rollup below does not
  // need a second query per row.
  //
  // The default Prisma client returns only live rows (the soft-delete
  // extension applies a deletedAt IS NULL filter automatically). We rely
  // on that here rather than passing an explicit deletedAt: null so the
  // filter stays consistent with every other live-rows query in the app.
  const orgFilter =
    options._testOrganizationIds && options._testOrganizationIds.length > 0
      ? { client: { organizationId: { in: options._testOrganizationIds } } }
      : {}

  const candidates = await db.batch.findMany({
    where: {
      currentStep: 'completed',
      completedAt: { lt: cutoff },
      ...orgFilter,
    },
    select: {
      id: true,
      client: { select: { organizationId: true } },
    },
  })

  logger.info('auto-archive plan', {
    cutoffISO: cutoff.toISOString(),
    candidates: candidates.length,
  })

  if (candidates.length === 0) {
    return { ok: true, totals: { batches: 0 } }
  }

  const batchIds = candidates.map((b) => b.id)

  // Single updateMany. No need to cascade to Posts; see method docstring.
  // We chunk only if we ever see > 1000 candidates in a single run; the
  // beta app should never approach this in practice, but the guard keeps
  // a runaway data set from blowing up a single transaction.
  const CHUNK = 1000
  let archived = 0
  for (let i = 0; i < batchIds.length; i += CHUNK) {
    const slice = batchIds.slice(i, i + CHUNK)
    const { count } = await db.batch.updateMany({
      where: { id: { in: slice } },
      data: { deletedAt: now, deletedBy: SYSTEM_ACTOR },
    })
    archived += count
  }

  // Audit: one rolled-up entry per organization. Mirrors the pattern in
  // purgeArchivedItems.ts so the trash audit UI stays consistent.
  const rollups = new Map<string, number>()
  for (const c of candidates) {
    const orgId = c.client.organizationId
    rollups.set(orgId, (rollups.get(orgId) ?? 0) + 1)
  }

  const runStamp = now.toISOString()
  for (const [orgId, count] of rollups.entries()) {
    await writeTrashAudit(db, {
      actorUserId: SYSTEM_ACTOR,
      organizationId: orgId,
      action: 'archive',
      entityType: 'batch',
      entityId: `system:auto-archive-completed:${runStamp}`,
      parentContext: { rollup: true, runAt: runStamp, reason: 'completed-retention' },
      cascadeCount: count,
    })
  }

  logger.info('auto-archive done', { archived })

  return { ok: true, totals: { batches: archived } }
}
