import { RelayRole } from '@prisma/client'
import { db } from '@/db/client'
import { findContentRun } from '@/server/repositories/contentRuns'
import { parseLabel, buildBatchLabel } from '@/lib/batch-target-month'

export type FinalizeChoice =
  | { choice: 'add'; runId: string; batchId: string }
  | { choice: 'replace'; runId: string; batchId: string }
  | { choice: 'new'; runId: string; label: string }
  | { choice: 'auto-new'; runId: string }

export interface FinalizeResult {
  batchId: string
  clientId: string
}

/**
 * Attaches a completed ContentRun's posts to a batch. Pure service: no
 * auth, no revalidation. Callers (foreground action, background pipeline)
 * handle those.
 */
export async function finalizePostGeneration({
  input,
  actorUserId,
}: {
  input: FinalizeChoice
  actorUserId: string
}): Promise<FinalizeResult> {
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
    targetBatchId = await createBatchForRun(
      run.clientId,
      input.label,
      actorUserId,
    )
  } else {
    // auto-new: canonical "{Client Name} {Month Year}" label so batches read
    // consistently across the app (matches the format from buildBatchLabel).
    const clientRow = await db.client.findUnique({
      where: { id: run.clientId },
      select: { name: true },
    })
    targetBatchId = await createBatchForRun(
      run.clientId,
      buildBatchLabel(clientRow?.name ?? 'Batch', run.targetMonth),
      actorUserId,
    )
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

  return { batchId: targetBatchId, clientId: run.clientId }
}

async function createBatchForRun(
  clientId: string,
  label: string,
  fallbackHolderId: string,
): Promise<string> {
  // Reuse the most-recent batch's holder when possible so handoff stays
  // continuous; fall back to the requesting user when none exists.
  const anyBatch = await db.batch.findFirst({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    select: { currentHolder: true, currentRole: true },
  })
  const newBatch = await db.batch.create({
    data: {
      clientId,
      label,
      currentStep: 'copy',
      currentSubState: 'drafted',
      currentHolder: anyBatch?.currentHolder ?? fallbackHolderId,
      currentRole: anyBatch?.currentRole ?? RelayRole.am,
    },
  })
  return newBatch.id
}

/**
 * Picks a default attach-target for background auto-finalize: matching
 * batch by parsed targetMonth (preferring populated batches), else null
 * meaning "create a new batch with the targetMonth label."
 */
export async function findDefaultMatchingBatch(
  clientId: string,
  targetMonth: string,
): Promise<{ batchId: string } | null> {
  const candidates = await db.batch.findMany({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, label: true, createdAt: true },
  })
  const matches = candidates.filter((b) => {
    const parsed = parseLabel(b.label, b.createdAt)
    return parsed === targetMonth
  })
  if (matches.length === 0) return null

  const withCounts = await Promise.all(
    matches.map(async (b) => ({
      ...b,
      postCount: await db.post.count({ where: { batchId: b.id } }),
    })),
  )
  withCounts.sort((a, b) => {
    if (a.postCount !== b.postCount) return b.postCount - a.postCount
    return b.createdAt.getTime() - a.createdAt.getTime()
  })
  return { batchId: withCounts[0].id }
}
