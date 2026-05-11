import { notFound, redirect } from 'next/navigation'
import { findContentRun } from '@/server/repositories/contentRuns'
import { db } from '@/db/client'

/**
 * Legacy /runs/[runId] route. Now a redirect handler.
 *
 *  - If the run has posts attached to a batch, 301 → that batch page
 *  - If the run has posts but no batchId (rare legacy data), → client page
 *  - If the run has zero posts, look up a batch matching this client +
 *    targetMonth via label heuristic; else fall back to client page
 *  - If the run does not exist, 404
 *
 * Per spec § Section A routing table.
 */
export default async function RunRedirectPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>
}) {
  const { id, runId } = await params

  const run = await findContentRun(runId)
  if (!run || run.clientId !== id) notFound()

  const postWithBatch = await db.post.findFirst({
    where: { contentRunId: runId, batchId: { not: null } },
    select: { batchId: true },
  })

  if (postWithBatch?.batchId) {
    redirect(`/clients/${id}/batches/${postWithBatch.batchId}`)
  }

  // No posts attached to a batch: try to find a batch for this client whose
  // label matches the run's targetMonth. If multiple, pick most recent.
  const monthSlug = run.targetMonth // YYYY-MM
  const monthName = monthNameFromSlug(monthSlug)
  const candidateBatches = await db.batch.findMany({
    where: { clientId: id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, label: true },
  })

  const matched = candidateBatches.find(
    (b) =>
      b.label.toLowerCase().includes(monthName.toLowerCase()) ||
      b.label.includes(monthSlug),
  )
  if (matched) redirect(`/clients/${id}/batches/${matched.id}`)

  redirect(`/clients/${id}`)
}

function monthNameFromSlug(ym: string): string {
  const [, m] = ym.split('-')
  const idx = parseInt(m, 10) - 1
  return [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ][idx] ?? ''
}
