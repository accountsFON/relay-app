'use server'

import { requireClientEditor } from '@/server/middleware/permissions'
import { findClientById } from '@/server/repositories/clients'
import {
  createContentRun,
  findExistingRun,
  findContentRun,
} from '@/server/repositories/contentRuns'
import { db } from '@/db/client'

export async function triggerGeneration(clientId: string, targetMonth: string) {
  const ctx = await requireClientEditor()

  const client = await findClientById(clientId, ctx.organizationDbId)
  if (!client) throw new Error('Client not found')

  const existing = await findExistingRun(clientId, targetMonth)
  if (existing) {
    if (existing.status === 'queued' || existing.status === 'failed') {
      await db.contentRun.delete({ where: { id: existing.id } })
    } else {
      throw new Error(
        `A run for ${targetMonth} is already ${existing.status}. ` +
          'Wait for it to finish or delete it first.'
      )
    }
  }

  const contentRun = await createContentRun({
    clientId,
    triggeredById: ctx.userDbId,
    targetMonth,
  })

  try {
    const { generateContentTask } = await import('@/server/jobs/generateContent')
    await generateContentTask.trigger({ contentRunId: contentRun.id })
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

export async function getRunStatus(contentRunId: string) {
  const run = await findContentRun(contentRunId)
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
