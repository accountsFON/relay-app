'use server'

import { requireClientEditor } from '@/server/middleware/permissions'
import { findClientById } from '@/server/repositories/clients'
import {
  createContentRun,
  findExistingRun,
  findContentRun,
} from '@/server/repositories/contentRuns'

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

  try {
    const { generateContentTask } = await import('@/server/jobs/generateContent')
    await generateContentTask.trigger({ contentRunId: contentRun.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Trigger.dev trigger failed:', message)
    // Update the run to reflect the trigger failure but don't crash —
    // the ContentRun is created so the user can see something happened
    const { db } = await import('@/db/client')
    await db.contentRun.update({
      where: { id: contentRun.id },
      data: {
        status: 'failed',
        errorMessage: `Pipeline trigger failed: ${message}. Ensure TRIGGER_SECRET_KEY is set and the task is deployed to Trigger.dev.`,
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
