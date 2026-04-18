'use server'

import { revalidatePath } from 'next/cache'
import { requireClientEditor } from '@/server/middleware/permissions'
import { findClientById } from '@/server/repositories/clients'
import {
  createContentRun,
  findExistingRun,
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

  const client = await findClientById(clientId, ctx.organizationDbId)
  if (!client) throw new Error('Client not found')

  const existing = await db.contentRun.findMany({
    where: { clientId, targetMonth },
  })

  for (const run of existing) {
    if (run.status === 'running') {
      throw new Error('A run is currently in progress for this month')
    }
    await db.post.deleteMany({ where: { contentRunId: run.id } })
    await db.contentRun.delete({ where: { id: run.id } })
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

  revalidatePath(`/clients/${clientId}`)
  return { contentRunId: contentRun.id }
}

export async function bulkGenerateContent(
  clientIds: string[],
  targetMonth: string
) {
  const ctx = await requireClientEditor()

  const results: { clientId: string; clientName: string; contentRunId?: string; error?: string }[] = []

  for (const clientId of clientIds) {
    const client = await findClientById(clientId, ctx.organizationDbId)
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
      await db.post.deleteMany({ where: { contentRunId: existing.id } })
      await db.contentRun.delete({ where: { id: existing.id } })
    }

    const contentRun = await createContentRun({
      clientId,
      triggeredById: ctx.userDbId,
      targetMonth,
    })

    try {
      const { generateContentTask } = await import('@/server/jobs/generateContent')
      await generateContentTask.trigger({ contentRunId: contentRun.id })
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
