'use server'

import { requireClientEditor } from '@/server/middleware/permissions'
import { findClientById } from '@/server/repositories/clients'
import {
  createContentRun,
  findExistingRun,
  findContentRun,
} from '@/server/repositories/contentRuns'
import { generateContentTask } from '@/server/jobs/generateContent'

export async function triggerGeneration(clientId: string, targetMonth: string) {
  const ctx = await requireClientEditor()

  const client = await findClientById(clientId, ctx.organizationDbId)
  if (!client) throw new Error('Client not found')

  const existing = await findExistingRun(clientId, targetMonth)
  if (existing) {
    throw new Error(
      `A run for ${targetMonth} already exists (status: ${existing.status}). ` +
        'Archive or delete it before generating again.'
    )
  }

  const contentRun = await createContentRun({
    clientId,
    triggeredById: ctx.userDbId,
    targetMonth,
  })

  await generateContentTask.trigger({ contentRunId: contentRun.id })

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
