'use server'

import { revalidatePath } from 'next/cache'
import { requireClientEditor } from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import {
  archiveContentRun,
  createContentRun,
  findExistingRun,
  findMatchingBatchForClientMonth,
} from '@/server/repositories/contentRuns'
import { db } from '@/db/client'

export async function deleteContentRun(runId: string) {
  const ctx = await requireClientEditor()

  const run = await db.contentRun.findUnique({
    where: { id: runId },
    include: { client: { select: { organizationId: true, id: true } } },
  })

  if (!run || run.client.organizationId !== ctx.organizationDbId) {
    throw new Error('Run not found')
  }

  const scoped = await findClientForUser(ctx, run.client.id)
  if (!scoped) {
    throw new Error('Run not found')
  }

  if (run.status === 'running') {
    throw new Error('Cannot delete a run that is currently in progress')
  }

  await db.post.deleteMany({ where: { contentRunId: runId } })
  await db.contentRun.delete({ where: { id: runId } })

  revalidatePath(`/clients/${run.client.id}`)
  revalidatePath('/dashboard')
}

export async function regenerateContentRun(
  clientId: string,
  targetMonth: string
) {
  const ctx = await requireClientEditor()

  const client = await findClientForUser(ctx, clientId)
  if (!client) throw new Error('Client not found')

  const existing = await db.contentRun.findMany({
    where: { clientId, targetMonth },
  })

  for (const run of existing) {
    if (run.status === 'running') {
      throw new Error('A run is currently in progress for this month')
    }
    // Soft-delete via archiveContentRun (cascades to posts + writes
    // trash audit). Replaces a previous hard-delete that lost ~$0.40 of
    // AI spend and any attached batch's posts without warning.
    await archiveContentRun({ runId: run.id, actorUserId: ctx.userDbId })
  }

  // Pre-flight Replace resolution: if a matching batch exists for this
  // client + month, regenerate attaches into it on completion (atomic swap
  // via the InFlightAutoFinalizer). No match -> targetBatchId stays null
  // and auto-finalizer takes the auto-new path. Either way the legacy
  // InFlightChoiceModal is not reached, which is the prerequisite for
  // removing it in a follow-up PR.
  const matching = await findMatchingBatchForClientMonth(clientId, targetMonth)

  const contentRun = await createContentRun({
    clientId,
    triggeredById: ctx.userDbId,
    targetMonth,
    targetBatchId: matching?.id ?? null,
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

  revalidatePath(`/clients/${clientId}`)
  return { contentRunId: contentRun.id }
}

export async function bulkGenerateContent(
  items: { clientId: string; reCrawl: boolean }[],
  targetMonth: string,
): Promise<{ clientId: string; clientName: string; contentRunId?: string; error?: string }[]> {
  const ctx = await requireClientEditor()

  const results: { clientId: string; clientName: string; contentRunId?: string; error?: string }[] = []

  for (const item of items) {
    const { clientId, reCrawl } = item
    const client = await findClientForUser(ctx, clientId)
    if (!client) {
      results.push({ clientId, clientName: 'Unknown', error: 'Client not found' })
      continue
    }

    const existing = await findExistingRun(clientId, targetMonth)
    if (existing && existing.status === 'running') {
      results.push({ clientId, clientName: client.name, error: 'Already running' })
      continue
    }

    if (existing) {
      // Soft-delete via archiveContentRun. See regenerateContentRun above.
      await archiveContentRun({ runId: existing.id, actorUserId: ctx.userDbId })
    }

    // Pre-flight Replace resolution per client. See regenerateContentRun
    // above for the full rationale. Done per client because bulk-gen
    // iterates and each client has its own matching batch (or doesn't).
    const matching = await findMatchingBatchForClientMonth(clientId, targetMonth)

    const contentRun = await createContentRun({
      clientId,
      triggeredById: ctx.userDbId,
      targetMonth,
      targetBatchId: matching?.id ?? null,
    })

    try {
      const { generateContentTask } = await import('@/server/jobs/generateContent')
      await generateContentTask.trigger({ contentRunId: contentRun.id, reCrawl })
      results.push({ clientId, clientName: client.name, contentRunId: contentRun.id })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await db.contentRun.update({
        where: { id: contentRun.id },
        data: { status: 'failed', errorMessage: `Trigger failed: ${message}` },
      })
      results.push({ clientId, clientName: client.name, error: message })
    }
  }

  revalidatePath('/clients')
  revalidatePath('/dashboard')
  return results
}
