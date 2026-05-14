import { notFound, redirect } from 'next/navigation'
import { requireOrgContext } from '@/server/middleware/auth'
import { findClientForUser } from '@/server/repositories/clients'
import { findContentRunForOrg } from '@/server/repositories/contentRuns'
import { db } from '@/db/client'

/**
 * Legacy /runs/[runId] route. Now a redirect handler.
 *
 *  - If the run has posts attached to a batch, 301 → that batch page
 *  - If the run has posts but no batchId (rare legacy data), → client page
 *  - If the run has zero posts, look up a batch matching this client +
 *    targetMonth via label heuristic; else fall back to client page
 *  - If the run does not exist OR is not in the actor's scope, 404
 *
 * Per spec § Section A routing table.
 *
 * Auth + scope: previously this page had no auth call at all, so an
 * authenticated user with any runId could probe other agencies' runs
 * (notFound vs redirect leaked existence; the redirect Location header
 * leaked the matching batchId). Now requires the actor to be in the
 * run's org AND have scope to the client (findClientForUser handles
 * the role/assignment filter).
 */
export default async function RunRedirectPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>
}) {
  const { id, runId } = await params

  const ctx = await requireOrgContext()

  // Scope-check the client first via findClientForUser; same convention
  // used by every other route inside (app)/clients/[id]/. Out-of-scope
  // returns null so we notFound() rather than 403.
  const client = await findClientForUser(ctx, id)
  if (!client) notFound()

  const run = await findContentRunForOrg(runId, ctx.organizationDbId)
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
