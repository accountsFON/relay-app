'use server'

import { requireClientEditor } from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import {
  createContentRun,
  findExistingRun,
  findContentRunForOrg,
} from '@/server/repositories/contentRuns'
import { db } from '@/db/client'

export async function triggerGeneration(
  clientId: string,
  targetMonth: string,
  reCrawl?: boolean,
  opts?: { targetBatchId?: string | null },
) {
  const ctx = await requireClientEditor()

  const client = await findClientForUser(ctx, clientId)
  if (!client) throw new Error('Client not found')

  const existing = await findExistingRun(clientId, targetMonth)
  if (existing) {
    if (existing.status === 'running') {
      throw new Error('A run is currently in progress for this month. Wait for it to finish.')
    }
    // Pre-delete the previous run only when there's no replace plan.
    // When targetBatchId is set, the atomic swap at finalize handles cleanup
    // of the existing posts in the target batch. Pre-deleting here would
    // empty the batch before the new run completes, violating atomic swap.
    if (!opts?.targetBatchId) {
      await db.post.deleteMany({ where: { contentRunId: existing.id } })
      await db.contentRun.delete({ where: { id: existing.id } })
    }
  }

  const contentRun = await createContentRun({
    clientId,
    triggeredById: ctx.userDbId,
    targetMonth,
    targetBatchId: opts?.targetBatchId ?? null,
  })

  try {
    const { generateContentTask } = await import('@/server/jobs/generateContent')
    const shouldCrawl = reCrawl ?? (client.autoCrawl === 'always' || (client.autoCrawl === 'when_empty' && !client.crawledData))
    await generateContentTask.trigger({ contentRunId: contentRun.id, reCrawl: shouldCrawl })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db.contentRun.update({
      where: { id: contentRun.id },
      data: {
        status: 'failed',
        errorMessage: `Pipeline trigger failed: ${message}`,
      },
    })
  }

  return { contentRunId: contentRun.id }
}

export async function getClientCrawlInfo(clientId: string) {
  const ctx = await requireClientEditor()
  const client = await findClientForUser(ctx, clientId)
  if (!client) return null

  return {
    autoCrawl: client.autoCrawl,
    hasCrawledData: !!client.crawledData,
    crawledDataAt: client.crawledDataAt?.toISOString() ?? null,
  }
}

/**
 * Returns run status for the polling dialog. Auth + scope are both
 * required: previously this endpoint had no auth call at all (any caller
 * with the runId could read it) and no scope check (any authenticated
 * user could read runs from any other agency, including error messages
 * and brief snippets).
 */
export async function getRunStatus(contentRunId: string) {
  const ctx = await requireClientEditor()
  const run = await findContentRunForOrg(contentRunId, ctx.organizationDbId)
  if (!run) return null

  return {
    id: run.id,
    status: run.status,
    brief: !!run.brief,
    crawledContent: !!run.crawledContent,
    supportingFacts: !!run.supportingFacts,
    postCount: run.posts.length,
    totalCostUsd: run.totalCostUsd ? Number(run.totalCostUsd) : null,
    errorMessage: run.errorMessage,
  }
}
