import { db } from '@/db/client'
import { Prisma } from '@prisma/client'
import type { DateScope } from '@/lib/date-scope'
import { dateScopeIncludesMonth } from '@/lib/date-scope'
import { parseLabel } from '@/lib/batch-target-month'
import { writeTrashAudit } from '@/server/repositories/trashAuditLogs'
import { can } from '@/server/auth/permissions'
import type { UserRole } from '@/lib/types'

export async function createContentRun(input: {
  clientId: string
  triggeredById: string
  targetMonth: string
  targetBatchId?: string | null
}) {
  return db.contentRun.create({
    data: {
      clientId: input.clientId,
      triggeredById: input.triggeredById,
      targetMonth: input.targetMonth,
      targetBatchId: input.targetBatchId ?? null,
      status: 'queued',
    },
  })
}

export async function findContentRun(id: string) {
  return db.contentRun.findUnique({
    where: { id },
    include: { posts: { orderBy: { postDate: 'asc' } } },
  })
}

/**
 * Returns the run (with posts) if `actorOrganizationId` matches the run's
 * organization, else null. Mirrors the findClientForUser convention:
 * out-of-scope returns null so callers can treat the run as "not found"
 * rather than 403, avoiding existence leaks across org boundaries.
 *
 * Use this anywhere a server action receives a user-supplied runId. Without
 * the scope check, any authenticated user can read a run's brief, costs,
 * post count, and error message from any other agency by passing its id.
 */
export async function findContentRunForOrg(
  id: string,
  actorOrganizationId: string,
) {
  const run = await db.contentRun.findUnique({
    where: { id },
    include: {
      posts: { orderBy: { postDate: 'asc' } },
      client: { select: { organizationId: true } },
    },
  })
  if (!run) return null
  if (run.client.organizationId !== actorOrganizationId) return null
  return run
}

export async function findExistingRun(clientId: string, targetMonth: string) {
  return db.contentRun.findFirst({
    where: {
      clientId,
      targetMonth,
      status: { in: ['queued', 'running', 'complete'] },
    },
  })
}

export async function listRunsByClient(
  clientId: string,
  opts: { dateScope?: DateScope } = {},
) {
  const runs = await db.contentRun.findMany({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      targetMonth: true,
      status: true,
      totalCostUsd: true,
      creditsConsumed: true,
      createdAt: true,
      completedAt: true,
      errorMessage: true,
      _count: { select: { posts: true } },
    },
  })
  if (!opts.dateScope) return runs
  // Runs are month-keyed (targetMonth = "YYYY-MM"), not timestamp-keyed.
  // Filter by month overlap with the scope range per spec edge case.
  return runs.filter((r) => dateScopeIncludesMonth(opts.dateScope!, r.targetMonth))
}

/**
 * Recently failed ContentRuns scoped to an organization. Powers the admin
 * Failed Runs section and any future ops dashboards. Sorted newest first.
 *
 * Uses `createdAt` rather than `completedAt` because failed runs do not set
 * `completedAt`. We treat the run row's createdAt as a "best signal" for
 * recency. If a run failed long after creation (rare, but possible on
 * retries), it still surfaces here in the right order relative to others.
 */
export async function listFailedRunsForOrg(
  organizationId: string,
  opts: { limit?: number } = {},
) {
  return db.contentRun.findMany({
    where: {
      status: 'failed',
      client: { organizationId },
    },
    orderBy: { createdAt: 'desc' },
    take: opts.limit ?? 25,
    select: {
      id: true,
      clientId: true,
      targetMonth: true,
      errorMessage: true,
      totalCostUsd: true,
      creditsConsumed: true,
      createdAt: true,
      startedAt: true,
      client: { select: { id: true, name: true } },
      _count: { select: { posts: true } },
    },
  })
}

/**
 * Find the most recent ContentRun whose posts are attached to this batch.
 *
 * In practice today, exactly one run feeds a batch (the run for the
 * batch's targetMonth). The "most recent" rule handles the future case
 * where a regenerate creates a new run for the same batch.
 *
 * Returns null when the batch has zero posts (early-stage batches).
 */
export async function findRunForBatch(batchId: string) {
  const post = await db.post.findFirst({
    where: { batchId },
    orderBy: { contentRun: { createdAt: 'desc' } },
    select: { contentRunId: true },
  })
  if (!post) return null
  return findContentRun(post.contentRunId)
}

/**
 * For a given ContentRun, find the most-populated batch for the same client
 * and targetMonth. Returns null when no matching batch exists.
 *
 * This is the pure repository layer used by listInFlightRuns (enrichment) and
 * findMatchingBatchForRunAction (dialog lookup). Both callers share this query
 * so the match logic stays in one place.
 */
export async function findMatchingBatchForRun(
  runId: string,
): Promise<{ id: string; label: string; postCount: number } | null> {
  const run = await findContentRun(runId)
  if (!run) return null

  // Pull candidate batches for the client (cap at 50 most recent).
  // Exclude archived batches (deletedAt: null) so a retired batch can never
  // surface as a replace target — the soft-delete extension also enforces
  // this, but we make the intent explicit here.
  const candidates = await db.batch.findMany({
    where: { clientId: run.clientId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      label: true,
      createdAt: true,
    },
  })

  // Match by parsed targetMonth from each batch's label.
  const matches = candidates.filter((b) => {
    const parsed = parseLabel(b.label, b.createdAt)
    return parsed === run.targetMonth
  })

  if (matches.length === 0) return null

  // Get accurate post counts for each match via direct count.
  const matchesWithCounts = await Promise.all(
    matches.map(async (b) => ({
      ...b,
      postCount: await db.post.count({ where: { batchId: b.id, deletedAt: null } }),
    })),
  )

  // Prefer the batch with the most posts; tie-break by most recent createdAt.
  matchesWithCounts.sort((a, b) => {
    if (a.postCount !== b.postCount) return b.postCount - a.postCount
    return b.createdAt.getTime() - a.createdAt.getTime()
  })

  const best = matchesWithCounts[0]
  return {
    id: best.id,
    label: best.label,
    postCount: best.postCount,
  }
}

/**
 * Pre-flight sibling of findMatchingBatchForRun. Takes clientId and
 * targetMonth directly so it can be called before any ContentRun exists.
 *
 * Used by the pre-flight Replace flow in generateContentAction (probe phase).
 * Same matching rules: parseLabel on the batch label, archive exclusion,
 * prefer most-populated then most-recent.
 */
export async function findMatchingBatchForClientMonth(
  clientId: string,
  targetMonth: string,
): Promise<{ id: string; label: string; postCount: number } | null> {
  const candidates = await db.batch.findMany({
    where: { clientId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, label: true, createdAt: true },
  })

  const matches = candidates.filter((b) => {
    const parsed = parseLabel(b.label, b.createdAt)
    return parsed === targetMonth
  })

  if (matches.length === 0) return null

  const withCounts = await Promise.all(
    matches.map(async (b) => ({
      ...b,
      postCount: await db.post.count({ where: { batchId: b.id, deletedAt: null } }),
    })),
  )

  withCounts.sort((a, b) => {
    if (a.postCount !== b.postCount) return b.postCount - a.postCount
    return b.createdAt.getTime() - a.createdAt.getTime()
  })

  const best = withCounts[0]
  return { id: best.id, label: best.label, postCount: best.postCount }
}

export async function getMonthlyCostSummary(
  organizationId: string,
  opts: { dateScope?: DateScope } = {},
) {
  const fallbackStart = new Date()
  fallbackStart.setDate(1)
  fallbackStart.setHours(0, 0, 0, 0)

  const range = opts.dateScope ?? null
  const completedAtFilter: Prisma.DateTimeFilter | undefined =
    range
      ? {
          ...(range.from && { gte: range.from }),
          ...(range.to && { lt: range.to }),
        }
      : { gte: fallbackStart }

  const runs = await db.contentRun.findMany({
    where: {
      client: { organizationId },
      status: 'complete',
      ...(completedAtFilter && { completedAt: completedAtFilter }),
    },
    select: {
      totalCostUsd: true,
      client: { select: { id: true, name: true } },
    },
  })

  const totalCost = runs.reduce(
    (sum, r) => sum + Number(r.totalCostUsd ?? 0),
    0
  )

  const byClient = new Map<string, { name: string; cost: number; runs: number }>()
  for (const run of runs) {
    const entry = byClient.get(run.client.id) ?? {
      name: run.client.name,
      cost: 0,
      runs: 0,
    }
    entry.cost += Number(run.totalCostUsd ?? 0)
    entry.runs += 1
    byClient.set(run.client.id, entry)
  }

  return {
    totalCostUsd: Math.round(totalCost * 10000) / 10000,
    totalRuns: runs.length,
    byClient: Array.from(byClient.values()).sort((a, b) => b.cost - a.cost),
  }
}

// ---------------------------------------------------------------------------
// Trash: archive / restore
// ---------------------------------------------------------------------------

/**
 * Checks that `actorUserId` holds an org membership for the given
 * `organizationId` AND that the membership role has `run.delete` permission.
 *
 * `run.delete` is the closest existing permission key for soft-deleting a
 * ContentRun, it covers both admins and account managers, and excludes
 * designers and clients, which matches the intended gatekeeping.
 */
async function assertCanEditContentRun(
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
    'run.delete',
  )
  if (!allowed) {
    throw new Error(
      `Forbidden: user ${actorUserId} (role: ${membership.role}) does not have run.delete permission`,
    )
  }
}

export interface ContentRunArchiveInput {
  runId: string
  actorUserId: string
}

/**
 * Soft-deletes a ContentRun and all of its live Posts in a single transaction.
 *
 * - The run and every post where `deletedAt IS NULL` receive the same
 *   `deletedAt` timestamp and `deletedBy = actorUserId`.
 * - Posts already archived at a different timestamp are left untouched,
 *   preserving their independent-archive intent.
 * - A TrashAuditLog entry is written with `cascadeCount = 1 + <posts stamped>`.
 */
export async function archiveContentRun({
  runId,
  actorUserId,
}: ContentRunArchiveInput): Promise<void> {
  // Two-query pattern: withArchived() + include causes a Prisma invocation
  // error, so we fetch the run bare first, then load the client separately.
  const run = await db.contentRun.withArchived().findFirst({ where: { id: runId } })
  if (!run) throw new Error(`ContentRun ${runId} not found`)
  if (run.deletedAt) throw new Error(`ContentRun ${runId} is already archived`)

  const client = await db.client.withArchived().findFirst({ where: { id: run.clientId } })
  if (!client) throw new Error(`Client ${run.clientId} not found for ContentRun ${runId}`)

  const organizationId = client.organizationId
  await assertCanEditContentRun(actorUserId, organizationId)

  const now = new Date()
  await db.$transaction(async (tx) => {
    // Stamp the run itself.
    await tx.contentRun.update({
      where: { id: runId },
      data: { deletedAt: now, deletedBy: actorUserId },
    })

    // Stamp all live posts belonging to this run (skip already-archived ones).
    const { count: postCount } = await tx.post.updateMany({
      where: { contentRunId: runId, deletedAt: null },
      data: { deletedAt: now, deletedBy: actorUserId },
    })

    await writeTrashAudit(tx, {
      actorUserId,
      organizationId,
      action: 'archive',
      entityType: 'contentRun',
      entityId: runId,
      parentContext: { clientId: run.clientId },
      cascadeCount: 1 + postCount,
    })
  })
}

/**
 * Restores a soft-deleted ContentRun and any Posts whose `deletedAt` matches
 * the run's prior `deletedAt` timestamp (timestamp-aware restore).
 *
 * Posts archived independently at a different timestamp are left alone, they
 * were archived by a separate intent and should not be brought back by a run
 * restore.
 */
export async function restoreContentRun({
  runId,
  actorUserId,
}: ContentRunArchiveInput): Promise<void> {
  // Two-query pattern — same reason as archiveContentRun.
  const run = await db.contentRun.withArchived().findFirst({ where: { id: runId } })
  if (!run) throw new Error(`ContentRun ${runId} not found`)
  if (!run.deletedAt) throw new Error(`ContentRun ${runId} is not archived`)

  const client = await db.client.withArchived().findFirst({ where: { id: run.clientId } })
  if (!client) throw new Error(`Client ${run.clientId} not found for ContentRun ${runId}`)

  const organizationId = client.organizationId
  await assertCanEditContentRun(actorUserId, organizationId)

  const priorDeletedAt = run.deletedAt
  await db.$transaction(async (tx) => {
    // Restore the run.
    await tx.contentRun.update({
      where: { id: runId },
      data: { deletedAt: null, deletedBy: null },
    })

    // Restore only posts whose deletedAt matches the cascade timestamp.
    const { count: postCount } = await tx.post.updateMany({
      where: { contentRunId: runId, deletedAt: priorDeletedAt },
      data: { deletedAt: null, deletedBy: null },
    })

    await writeTrashAudit(tx, {
      actorUserId,
      organizationId,
      action: 'restore',
      entityType: 'contentRun',
      entityId: runId,
      parentContext: { clientId: run.clientId },
      cascadeCount: 1 + postCount,
    })
  })
}
