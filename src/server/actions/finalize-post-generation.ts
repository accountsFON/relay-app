'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { RelayRole } from '@prisma/client'
import { requireClientEditor } from '@/server/middleware/permissions'
import { db } from '@/db/client'
import { findContentRun } from '@/server/repositories/contentRuns'
import { parseLabel } from '@/lib/batch-target-month'

const ChoiceSchema = z.discriminatedUnion('choice', [
  z.object({
    choice: z.literal('add'),
    runId: z.string(),
    batchId: z.string(),
  }),
  z.object({
    choice: z.literal('replace'),
    runId: z.string(),
    batchId: z.string(),
  }),
  z.object({
    choice: z.literal('new'),
    runId: z.string(),
    label: z.string().min(1).max(100),
  }),
  z.object({
    choice: z.literal('auto-new'),
    runId: z.string(),
  }),
])

export type FinalizePostGenerationInput = z.infer<typeof ChoiceSchema>

/**
 * Finalize a completed ContentRun by attaching its posts to a batch.
 * Called from GenerateContentDialog after the user picks how to handle
 * the new posts (Add to existing batch, Replace existing batch's posts,
 * Start a new batch with custom label, or Auto-create new batch when no
 * matching batch exists).
 *
 * Pipeline (generateContent.ts) creates posts with batchId=null. This
 * action attaches them.
 */
export async function finalizePostGenerationAction(
  raw: unknown,
): Promise<{ batchId: string }> {
  const input = ChoiceSchema.parse(raw)
  const ctx = await requireClientEditor()

  const run = await findContentRun(input.runId)
  if (!run) throw new Error('Run not found')

  const newPostIds = run.posts.map((p) => p.id)
  if (newPostIds.length === 0) {
    throw new Error('Run has no posts to attach')
  }

  let targetBatchId: string

  if (input.choice === 'add') {
    targetBatchId = input.batchId
  } else if (input.choice === 'replace') {
    targetBatchId = input.batchId
    // Delete existing posts in the batch (excluding the just-generated ones,
    // which currently have batchId=null so they're not in this set anyway).
    await db.post.deleteMany({
      where: {
        batchId: input.batchId,
        id: { notIn: newPostIds },
      },
    })
  } else if (input.choice === 'new') {
    // Find a current holder for the new batch -- use the existing batch's
    // holder if any exists for this client, else the requesting user.
    const anyBatch = await db.batch.findFirst({
      where: { clientId: run.clientId },
      orderBy: { createdAt: 'desc' },
      select: { currentHolder: true, currentRole: true },
    })
    const newBatch = await db.batch.create({
      data: {
        clientId: run.clientId,
        label: input.label,
        currentStep: 'copy',
        currentSubState: 'drafted',
        currentHolder: anyBatch?.currentHolder ?? ctx.userDbId,
        currentRole: anyBatch?.currentRole ?? RelayRole.am,
      },
    })
    targetBatchId = newBatch.id
  } else {
    // auto-new: same as 'new' but with auto-generated label from targetMonth
    const anyBatch = await db.batch.findFirst({
      where: { clientId: run.clientId },
      orderBy: { createdAt: 'desc' },
      select: { currentHolder: true, currentRole: true },
    })
    const newBatch = await db.batch.create({
      data: {
        clientId: run.clientId,
        label: run.targetMonth,
        currentStep: 'copy',
        currentSubState: 'drafted',
        currentHolder: anyBatch?.currentHolder ?? ctx.userDbId,
        currentRole: anyBatch?.currentRole ?? RelayRole.am,
      },
    })
    targetBatchId = newBatch.id
  }

  // Attach the new posts to the target batch.
  await db.post.updateMany({
    where: { id: { in: newPostIds } },
    data: { batchId: targetBatchId },
  })

  // For 'add' / 'replace', advance the batch sub-state to drafted.
  if (input.choice === 'add' || input.choice === 'replace') {
    await db.batch.update({
      where: { id: targetBatchId },
      data: { currentSubState: 'drafted' },
    })
  }

  // Revalidate any pages that show the batch.
  revalidatePath(`/clients/${run.clientId}/batches/${targetBatchId}`)
  revalidatePath(`/clients/${run.clientId}`)

  return { batchId: targetBatchId }
}

/**
 * Look up an existing batch matching this client + targetMonth so the modal
 * can decide whether to show the choice prompt. Called as a server action
 * from the dialog after generation completes.
 */
export async function findMatchingBatchForRunAction(
  runId: string,
): Promise<{ batchId: string; label: string; postCount: number } | null> {
  await requireClientEditor()
  const run = await findContentRun(runId)
  if (!run) return null

  // Pull candidate batches for the client (cap at 50 most recent — typical
  // client has < 12 batches across a year; this is generous).
  const candidates = await db.batch.findMany({
    where: { clientId: run.clientId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      label: true,
      createdAt: true,
    },
  })
  console.log('[debug findMatchingBatch] runId=%s clientId=%s targetMonth=%s candidates=%d',
    runId, run.clientId, run.targetMonth, candidates.length)

  // Match by parsed targetMonth from each batch's label.
  // The just-generated posts have batchId=null so they're not in any count.
  const matches = candidates.filter((b) => {
    const parsed = parseLabel(b.label, b.createdAt)
    return parsed === run.targetMonth
  })

  console.log('[debug findMatchingBatch] matches.length=%d, labels=%s',
    matches.length, matches.map(m => m.label).join(','))

  if (matches.length === 0) return null

  // Get accurate post counts for each match via direct count.
  // (Prisma's _count.posts in a select was returning 0 incorrectly here.)
  const matchesWithCounts = await Promise.all(
    matches.map(async (b) => ({
      ...b,
      postCount: await db.post.count({ where: { batchId: b.id } }),
    })),
  )

  console.log('[debug findMatchingBatch] matchesWithCounts=%j', matchesWithCounts)

  // Multiple matches: prefer the batch with the most posts (the user's
  // actual in-use batch, not an empty stub from a prior auto-new pass).
  // Tie-break by most recent createdAt.
  matchesWithCounts.sort((a, b) => {
    if (a.postCount !== b.postCount) return b.postCount - a.postCount
    return b.createdAt.getTime() - a.createdAt.getTime()
  })

  const best = matchesWithCounts[0]
  console.log('[debug findMatchingBatch] returning best=%j', { batchId: best.id, label: best.label, postCount: best.postCount })
  return {
    batchId: best.id,
    label: best.label,
    postCount: best.postCount,
  }
}
