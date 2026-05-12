'use server'

import { requireOrgContext } from '@/server/middleware/auth'
import { requireClientEditor } from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import { db } from '@/db/client'

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
 *   - failed:           status = 'failed' AND acknowledgedAt IS NULL
 *
 * Ordered by createdAt asc so the choice modal queues correctly.
 * matchingBatch is not populated here — Task A5 will add that enrichment.
 */
export async function listInFlightRuns(): Promise<InFlightRun[]> {
  const ctx = await requireOrgContext()

  const rows = await db.contentRun.findMany({
    where: {
      client: { organizationId: ctx.organizationDbId },
      OR: [
        { status: { notIn: [...TERMINAL_STATUSES] } },
        { status: 'complete', posts: { some: { batchId: null } } },
        { status: 'failed', acknowledgedAt: null },
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
      client: { select: { name: true } },
      _count: { select: { posts: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return rows.map((row): InFlightRun => {
    const intent: InFlightRunIntent =
      row.status === 'failed'
        ? 'failed'
        : row.status === 'complete'
          ? 'awaiting_choice'
          : 'active'

    return {
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
    }
  })
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
