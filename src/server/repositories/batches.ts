import type { RelayStep, RelayRole } from '@prisma/client'
import { RelayStep as RelayStepEnum } from '@prisma/client'
import { db } from '@/db/client'
import type { DbClient, DbTx } from '@/db/client'
import { writeTrashAudit } from '@/server/repositories/trashAuditLogs'
import { can } from '@/server/auth/permissions'
import type { UserRole, OrgContext } from '@/lib/types'

type DbOrTx = DbClient | DbTx

export async function findBatch(id: string) {
  // withArchived() so the batch page still loads when the batch is soft-deleted.
  return db.batch.withArchived().findFirst({
    where: { id },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          organizationId: true,
          clientReviewEmail: true,
        },
      },
      holder: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } },
      checklists: { orderBy: { id: 'asc' } },
    },
  })
}

export async function findBatchSlim(id: string, tx?: DbOrTx) {
  const client = tx ?? db
  return client.batch.findUnique({
    where: { id },
    select: {
      id: true,
      clientId: true,
      currentStep: true,
      currentSubState: true,
      currentHolder: true,
      currentRole: true,
    },
  })
}

export async function listBatchesByClient(clientId: string) {
  return db.batch.findMany({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    include: {
      holder: { select: { id: true, name: true, avatarUrl: true } },
      _count: { select: { posts: true } },
    },
  })
}

export async function listBatchesByHolder(userId: string) {
  return db.batch.findMany({
    where: { currentHolder: userId },
    orderBy: { createdAt: 'desc' },
    include: {
      client: { select: { id: true, name: true } },
      _count: { select: { posts: true } },
    },
  })
}

/**
 * Stuck Watchlist: batches whose currentStep hasn't progressed in
 * the last `idleHours` (default 48, spec § Verification step 14).
 * Approximates "stuck" by createdAt of the most recent RelayEvent
 * landing on this step.
 */
export async function listStuckBatches(orgId: string, idleHours = 48) {
  const cutoff = new Date(Date.now() - idleHours * 60 * 60 * 1000)
  return db.batch.findMany({
    where: {
      client: { organizationId: orgId },
      OR: [
        { relayEvents: { none: {} }, createdAt: { lt: cutoff } },
        {
          relayEvents: {
            some: {},
            every: { createdAt: { lt: cutoff } },
          },
        },
      ],
    },
    include: {
      client: { select: { id: true, name: true } },
      holder: { select: { id: true, name: true, role: true, avatarUrl: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
}

export async function listChecklistForBatch(batchId: string) {
  return db.checklistItem.findMany({
    where: { batchId },
    orderBy: { id: 'asc' },
  })
}

export async function createBatch(input: {
  clientId: string
  label: string
  currentStep: RelayStep
  currentSubState?: string | null
  currentHolder: string
  currentRole: RelayRole
  clientReviewEnabled: boolean
}) {
  return db.batch.create({ data: { ...input } })
}

export async function listOnboardingQueue(orgId: string) {
  return db.client.findMany({
    where: { organizationId: orgId, onboardingCompletedAt: null },
    select: {
      id: true,
      name: true,
      assignedAmId: true,
      assignedDesignerId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })
}

/**
 * All batches for an org. Used by the AM kanban (filter client-side
 * to assignedAmId === userId) and admin dashboards.
 */
export async function listBatchesForOrg(
  orgId: string,
  options?: { showArchived?: boolean },
) {
  const query = options?.showArchived ? db.batch.withArchived() : db.batch
  return query.findMany({
    where: { client: { organizationId: orgId } },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          assignedAmId: true,
          assignedDesignerId: true,
        },
      },
      holder: { select: { id: true, name: true, role: true, avatarUrl: true } },
      _count: { select: { posts: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * List batches in flight for a client, sorted by held-by-viewer first,
 * then by most recent activity (RelayEvent createdAt, fallback to batch.createdAt).
 *
 * In flight = not at a terminal step. Terminal = `completed` (the current
 * terminal step after the pipeline rework) plus the retired `final_qa_schedule`
 * that pre-rework batches may still sit at. Excluding `completed` fixes the
 * "N active" over-count (P1 #7). Archived (soft-deleted) batches are already
 * excluded by the Prisma soft-delete extension.
 *
 * Used by ActiveBatchesSection on the client page. In flight counts per
 * client are typically <5, so the in-JS sort is cheap.
 */
export async function listActiveBatchesForClient(
  clientId: string,
  viewerUserId: string,
) {
  const batches = await db.batch.findMany({
    where: {
      clientId,
      currentStep: {
        notIn: [RelayStepEnum.completed, RelayStepEnum.final_qa_schedule],
      },
    },
    include: {
      holder: { select: { id: true, name: true, role: true, avatarUrl: true } },
      _count: { select: { posts: true } },
      relayEvents: {
        take: 1,
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      },
    },
  })

  return batches.sort((a, b) => {
    const aHeldByViewer = a.currentHolder === viewerUserId ? 1 : 0
    const bHeldByViewer = b.currentHolder === viewerUserId ? 1 : 0
    if (aHeldByViewer !== bHeldByViewer) return bHeldByViewer - aHeldByViewer

    const aActivity = a.relayEvents[0]?.createdAt ?? a.createdAt
    const bActivity = b.relayEvents[0]?.createdAt ?? b.createdAt
    return bActivity.getTime() - aActivity.getTime()
  })
}

// ---------------------------------------------------------------------------
// Trash: archive / restore
// ---------------------------------------------------------------------------

/**
 * Checks that `actorUserId` holds an org membership with `run.delete`
 * permission. There is no dedicated `batch.delete` key; `run.delete`
 * is the closest existing key covering admins and account managers while
 * excluding designers and clients, which matches the intended gatekeeping.
 */
async function assertCanEditBatch(
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

export interface BatchArchiveInput {
  batchId: string
  actorUserId: string
}

/**
 * Soft-deletes a Batch and cascades to:
 * - All live Posts whose `batchId = batchId`
 * - All live ContentRuns that have at least one Post in this batch
 *   (there is no direct ContentRun.batchId column, the relationship
 *    is bridged through Posts).
 *
 * All three layers share the same `deletedAt` timestamp so a restore can
 * undo all of them with a single timestamp filter.
 *
 * A TrashAuditLog entry is written with
 * `cascadeCount = 1 + runsStamped + postsStamped`.
 */
export async function archiveBatch({
  batchId,
  actorUserId,
}: BatchArchiveInput): Promise<void> {
  // Two-query pattern: withArchived() + include causes a Prisma invocation
  // error, so we fetch the batch bare first, then load the client separately.
  const batch = await db.batch.withArchived().findFirst({ where: { id: batchId } })
  if (!batch) throw new Error(`Relay ${batchId} not found`)
  if (batch.deletedAt) throw new Error(`Relay ${batchId} is already archived`)

  const client = await db.client.withArchived().findFirst({ where: { id: batch.clientId } })
  if (!client) throw new Error(`Client ${batch.clientId} not found for Relay ${batchId}`)

  const organizationId = client.organizationId
  await assertCanEditBatch(actorUserId, organizationId)

  // Find all live ContentRuns that have at least one Post in this batch.
  // Done before the transaction so we have a stable ID list to update inside it.
  const affectedRuns = await db.contentRun.findMany({
    where: { posts: { some: { batchId } }, deletedAt: null },
    select: { id: true },
    distinct: ['id'],
  })
  const runIds = affectedRuns.map((r) => r.id)

  const now = new Date()
  await db.$transaction(async (tx) => {
    // Stamp the batch itself.
    await tx.batch.update({
      where: { id: batchId },
      data: { deletedAt: now, deletedBy: actorUserId },
    })

    // Stamp the affected ContentRuns (updateMany is NOT intercepted by the
    // soft-delete extension, so no explicit deletedAt: null guard is needed,
    // the IDs were already filtered to live-only above).
    if (runIds.length > 0) {
      await tx.contentRun.updateMany({
        where: { id: { in: runIds } },
        data: { deletedAt: now, deletedBy: actorUserId },
      })
    }

    // Stamp all live Posts in this batch.
    const { count: postCount } = await tx.post.updateMany({
      where: { batchId, deletedAt: null },
      data: { deletedAt: now, deletedBy: actorUserId },
    })

    await writeTrashAudit(tx, {
      actorUserId,
      organizationId,
      action: 'archive',
      entityType: 'batch',
      entityId: batchId,
      parentContext: { clientId: batch.clientId },
      cascadeCount: 1 + runIds.length + postCount,
    })
  })
}

/**
 * Restores a soft-deleted Batch using timestamp-aware restore on all three
 * cascaded layers (batch, ContentRuns, Posts).
 *
 * Only rows whose `deletedAt` matches the batch's prior `deletedAt` are
 * cleared, independently-archived rows at a different timestamp are left
 * alone.
 */
export async function restoreBatch({
  batchId,
  actorUserId,
}: BatchArchiveInput): Promise<void> {
  // Two-query pattern, same reason as archiveBatch.
  const batch = await db.batch.withArchived().findFirst({ where: { id: batchId } })
  if (!batch) throw new Error(`Relay ${batchId} not found`)
  if (!batch.deletedAt) throw new Error(`Relay ${batchId} is not archived`)

  const client = await db.client.withArchived().findFirst({ where: { id: batch.clientId } })
  if (!client) throw new Error(`Client ${batch.clientId} not found for Relay ${batchId}`)

  const organizationId = client.organizationId
  await assertCanEditBatch(actorUserId, organizationId)

  const priorDeletedAt = batch.deletedAt

  await db.$transaction(async (tx) => {
    // Restore the batch.
    await tx.batch.update({
      where: { id: batchId },
      data: { deletedAt: null, deletedBy: null },
    })

    // Restore ContentRuns whose deletedAt matches AND that have at least one
    // Post in this batch (posts still carry the cascade timestamp at this point).
    const { count: runCount } = await tx.contentRun.updateMany({
      where: {
        deletedAt: priorDeletedAt,
        posts: { some: { batchId } },
      },
      data: { deletedAt: null, deletedBy: null },
    })

    // Restore Posts whose deletedAt matches the cascade timestamp.
    const { count: postCount } = await tx.post.updateMany({
      where: { batchId, deletedAt: priorDeletedAt },
      data: { deletedAt: null, deletedBy: null },
    })

    await writeTrashAudit(tx, {
      actorUserId,
      organizationId,
      action: 'restore',
      entityType: 'batch',
      entityId: batchId,
      parentContext: { clientId: batch.clientId },
      cascadeCount: 1 + runCount + postCount,
    })
  })
}

/**
 * Batches sitting in Client Review past their org's review window, eligible
 * for auto-advance: auto-advance not disabled, window started, window elapsed,
 * and no submitted review session for the current round. The per-org window
 * length lives on the organization, so candidates are pulled cheaply and the
 * window check is applied in JS.
 */
export async function findStaleClientReviews(now: Date) {
  const candidates = await db.batch.findMany({
    where: {
      currentStep: RelayStepEnum.client_review,
      autoAdvanceOnTimeout: true,
      clientReviewStartedAt: { not: null },
    },
    select: {
      id: true,
      label: true,
      clientReviewStartedAt: true,
      client: {
        select: {
          id: true,
          assignedAmId: true,
          organization: { select: { reviewWindowDays: true } },
        },
      },
      magicLinks: {
        select: { reviewSessions: { select: { status: true } } },
      },
    },
  })
  return candidates.filter((b) => {
    const days = b.client.organization.reviewWindowDays
    const startedAt = b.clientReviewStartedAt
    if (!startedAt) return false
    const elapsedMs = now.getTime() - startedAt.getTime()
    if (elapsedMs < days * 24 * 60 * 60 * 1000) return false
    const hasSubmitted = b.magicLinks.some((m) =>
      m.reviewSessions.some((s) => s.status === 'submitted'),
    )
    return !hasSubmitted
  })
}

/**
 * Pipeline view for a Client-role user (their linked client only).
 * Returns the batches the client should see in their pipeline view.
 */
export async function listClientPipelineBatches(linkedClientId: string) {
  return db.batch.findMany({
    where: {
      clientId: linkedClientId,
      currentStep: {
        in: [
          'sent_to_client',
          'client_decision',
          'in_design',
          // `designs_completed` removed per Phase 3 item 15 PR1; no live
          // batch should sit here after the backfill. Enum value preserved
          // for historical RelayEvent rows.
          'am_review_design',
          // `design_revisions` retired per merge design steps (2026-06-26); no
          // live batch lands here after the backfill (they move to
          // am_review_design, which is already in this list). Kept in the filter
          // so any pre-cutover historical row still surfaces in the client view.
          'design_revisions',
          'am_qa_pre_client',
          'ready_to_schedule',
          'implementing_revisions',
          'revisions_complete',
          'final_qa_schedule',
          'copy',
        ],
      },
    },
    include: {
      _count: { select: { posts: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export interface ArchivedBatchRow {
  id: string
  clientId: string
  clientName: string
  label: string
  createdAt: Date
  deletedAt: Date | null
}

/**
 * Archived batches visible to the viewer, newest-archived first.
 * Admins + platform owners see the whole org; AMs see only their assigned
 * clients. Two-query pattern (bare onlyArchived + withArchived client names)
 * mirrors /admin/trash and keeps archived clients' names resolvable.
 */
export async function listArchivedBatchesForViewer(
  ctx: Pick<OrgContext, 'role' | 'platformOwner' | 'organizationDbId' | 'userDbId'>,
): Promise<ArchivedBatchRow[]> {
  const scopeToAm = ctx.role === 'account_manager' && !ctx.platformOwner
  const batches = await db.batch.onlyArchived().findMany({
    where: {
      client: {
        organizationId: ctx.organizationDbId,
        ...(scopeToAm ? { assignedAmId: ctx.userDbId } : {}),
      },
    },
    orderBy: { deletedAt: 'desc' },
    select: { id: true, clientId: true, label: true, createdAt: true, deletedAt: true },
  })
  if (batches.length === 0) return []
  const clientIds = [...new Set(batches.map((b) => b.clientId))]
  const clients = await db.client.withArchived().findMany({
    where: { id: { in: clientIds } },
    select: { id: true, name: true },
  })
  const nameById = new Map(clients.map((c) => [c.id, c.name]))
  return batches.map((b) => ({
    id: b.id,
    clientId: b.clientId,
    clientName: nameById.get(b.clientId) ?? 'Unknown client',
    label: b.label,
    createdAt: b.createdAt,
    deletedAt: b.deletedAt,
  }))
}
