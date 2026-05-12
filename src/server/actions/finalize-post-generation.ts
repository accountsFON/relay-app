'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireClientEditor } from '@/server/middleware/permissions'
import { db } from '@/db/client'
import { findContentRun } from '@/server/repositories/contentRuns'
import { parseLabel } from '@/lib/batch-target-month'
import { finalizePostGeneration } from '@/server/services/finalize-post-generation'

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
): Promise<{ batchId: string; alreadyFinalized?: true }> {
  const input = ChoiceSchema.parse(raw)
  // Auth runs unconditionally so unauthorized callers cannot probe for batchId
  // existence via the idempotency path.
  const ctx = await requireClientEditor()

  // Idempotency guard: if this run's posts are already attached to a batch,
  // return the existing batchId rather than throwing. This handles the
  // cross-tab race where two InFlightChoiceModals fire simultaneously.
  // Not-found guard is handled by the service; we only need to check whether
  // posts are already attached.
  const existingPost = await db.post.findFirst({
    where: { contentRunId: input.runId, batchId: { not: null } },
    select: { batchId: true },
  })
  if (existingPost?.batchId) {
    return { batchId: existingPost.batchId, alreadyFinalized: true }
  }

  const result = await finalizePostGeneration({ input, actorUserId: ctx.userDbId })
  // Revalidate any pages that show the batch.
  revalidatePath(`/clients/${result.clientId}/batches/${result.batchId}`)
  revalidatePath(`/clients/${result.clientId}`)
  return { batchId: result.batchId }
}

/**
 * Server action mirror of `deferFinalize` for client-side use. Sets the
 * autoFinalize flag on the run so the pipeline auto-attaches posts on
 * completion. Called when the user dismisses the generation dialog while
 * the pipeline is still running.
 */
export async function deferFinalizeAction(runId: string): Promise<void> {
  await requireClientEditor()
  await db.contentRun.update({
    where: { id: runId },
    data: { autoFinalize: true },
  })
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
  // Match by parsed targetMonth from each batch's label.
  // The just-generated posts have batchId=null so they're not in any count.
  const matches = candidates.filter((b) => {
    const parsed = parseLabel(b.label, b.createdAt)
    return parsed === run.targetMonth
  })

  if (matches.length === 0) return null

  // Get accurate post counts for each match via direct count.
  // (Prisma's _count.posts in a select was returning 0 incorrectly here.)
  const matchesWithCounts = await Promise.all(
    matches.map(async (b) => ({
      ...b,
      postCount: await db.post.count({ where: { batchId: b.id } }),
    })),
  )

  // Multiple matches: prefer the batch with the most posts (the user's
  // actual in-use batch, not an empty stub from a prior auto-new pass).
  // Tie-break by most recent createdAt.
  matchesWithCounts.sort((a, b) => {
    if (a.postCount !== b.postCount) return b.postCount - a.postCount
    return b.createdAt.getTime() - a.createdAt.getTime()
  })

  const best = matchesWithCounts[0]
  return {
    batchId: best.id,
    label: best.label,
    postCount: best.postCount,
  }
}
