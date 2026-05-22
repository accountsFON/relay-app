'use server'

import { db } from '@/db/client'
import { requireOrgContext } from '@/server/middleware/auth'
import { requireClientEditor } from '@/server/middleware/permissions'
import { getClientScopeFilter } from '@/server/auth/scope'
import { findClientForUser } from '@/server/repositories/clients'
import {
  archiveContentRun,
  findMatchingBatchForClientMonth,
  findMatchingBatchForRun,
} from '@/server/repositories/contentRuns'
import { triggerGeneration } from '@/app/(app)/clients/[id]/generate/actions'

const TERMINAL_STATUSES = ['complete', 'failed'] as const

export type InFlightRunIntent = 'active' | 'awaiting_choice' | 'failed'

export type InFlightRun = {
  id: string
  clientId: string
  clientName: string
  targetMonth: string
  intent: InFlightRunIntent
  status: string
  brief: boolean
  crawledContent: boolean
  supportingFacts: boolean
  postCount: number
  errorMessage: string | null
  startedAt: string
  targetBatchId: string | null
  matchingBatch?: {
    batchId: string
    label: string
    postCount: number
  }
}

/**
 * Returns all ContentRuns for the current org that are "in flight":
 *   - active:           status NOT IN ('complete', 'failed')
 *   - awaiting_choice:  status = 'complete' AND at least one Post has batchId IS NULL
 *
 * Failed runs are NOT included anymore. The notification bell's FailedRunRow
 * (driven by the `run_failed` ActivityKind mention) is the canonical surface
 * for unacknowledged failures, with inline Retry / Dismiss. The 2s pill poll
 * no longer fetches failed rows it never renders.
 *
 * Ordered by createdAt asc so the choice modal queues correctly.
 * matchingBatch is populated on awaiting_choice rows via findMatchingBatchForRun.
 */
export async function listInFlightRuns(): Promise<InFlightRun[]> {
  const ctx = await requireOrgContext()

  // Apply both the org filter AND the role/assignment scope filter on the
  // client side of the runs lookup. Without getClientScopeFilter, an AM
  // would see every other AM's in-flight runs in the same org, and a
  // designer or client would see runs they have no business knowing
  // about. Admin and platformOwner get an empty filter (see them all).
  const rows = await db.contentRun.findMany({
    where: {
      client: {
        organizationId: ctx.organizationDbId,
        ...getClientScopeFilter(ctx),
      },
      OR: [
        { status: { notIn: [...TERMINAL_STATUSES] } },
        { status: 'complete', posts: { some: { batchId: null } } },
      ],
    },
    select: {
      id: true,
      clientId: true,
      targetMonth: true,
      status: true,
      brief: true,
      crawledContent: true,
      supportingFacts: true,
      errorMessage: true,
      createdAt: true,
      targetBatchId: true,
      client: { select: { name: true } },
      _count: { select: { posts: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return Promise.all(
    rows.map(async (row): Promise<InFlightRun> => {
      const intent: InFlightRunIntent =
        row.status === 'failed'
          ? 'failed'
          : row.status === 'complete'
            ? 'awaiting_choice'
            : 'active'

      const base: InFlightRun = {
        id: row.id,
        clientId: row.clientId,
        clientName: row.client.name,
        targetMonth: row.targetMonth,
        intent,
        status: row.status,
        brief: !!row.brief,
        crawledContent: !!row.crawledContent,
        supportingFacts: !!row.supportingFacts,
        postCount: row._count.posts,
        errorMessage: row.errorMessage,
        startedAt: row.createdAt.toISOString(),
        targetBatchId: row.targetBatchId,
      }

      if (intent === 'awaiting_choice') {
        const match = await findMatchingBatchForRun(row.id)
        if (match) {
          base.matchingBatch = {
            batchId: match.id,
            label: match.label,
            postCount: match.postCount,
          }
        }
      }

      return base
    }),
  )
}

/**
 * Deletes a failed ContentRun (and its posts) and fires a fresh generation
 * for the same client + targetMonth. Returns the new run's ID so callers can
 * track progress.
 *
 * Auth order: auth -> existence -> org -> status -> write (mirrors acknowledgeFailedRunAction).
 */
export async function retryFailedRunAction(runId: string): Promise<{ newRunId: string }> {
  const ctx = await requireClientEditor()

  const run = await db.contentRun.findUnique({
    where: { id: runId },
    select: { clientId: true, targetMonth: true, status: true },
  })
  if (!run) throw new Error('Run not found')

  const client = await findClientForUser(ctx, run.clientId)
  if (!client) throw new Error('Run not in this org')

  if (run.status !== 'failed') throw new Error('Only failed runs can be retried')

  // Soft-delete the failed run via the trash module instead of hard-deleting.
  // Preserves the failed run's partial brief + crawl + error context for the
  // FailedRunBanner to display (and for support/audit lookups). Matches the
  // soft-delete pattern shipped in PR #74 for the other Generate paths.
  await archiveContentRun({ runId, actorUserId: ctx.userDbId })

  // Pre-flight Replace resolution: if there's a matching batch for this
  // client + month, retry attaches into it (atomic swap at completion).
  // No matching batch -> targetBatchId stays null and the AutoFinalizer
  // takes the auto-new path.
  const matching = await findMatchingBatchForClientMonth(
    run.clientId,
    run.targetMonth,
  )

  const { contentRunId } = await triggerGeneration(
    run.clientId,
    run.targetMonth,
    undefined,
    { targetBatchId: matching?.id ?? null },
  )
  return { newRunId: contentRunId }
}

/**
 * Marks a failed ContentRun as acknowledged so it drops from the in-flight UI.
 * Only the owning org can acknowledge a run, and only failed runs can be acknowledged.
 */
export async function acknowledgeFailedRunAction(runId: string): Promise<{ success: true }> {
  const ctx = await requireClientEditor()

  const run = await db.contentRun.findUnique({
    where: { id: runId },
    select: { clientId: true, status: true },
  })
  if (!run) throw new Error('Run not found')

  // Org-scoped permission check via the client.
  const client = await findClientForUser(ctx, run.clientId)
  if (!client) throw new Error('Run not in this org')

  if (run.status !== 'failed') throw new Error('Only failed runs can be acknowledged')

  await db.contentRun.update({
    where: { id: runId },
    data: { acknowledgedAt: new Date() },
  })

  return { success: true }
}
