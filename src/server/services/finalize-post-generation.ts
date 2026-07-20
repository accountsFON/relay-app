import { RelayStep } from '@prisma/client'
import { db } from '@/db/client'
import { findContentRunForOrg } from '@/server/repositories/contentRuns'
import { HOLDER_ROLE, seedChecklistForStep } from '@/server/lib/relay-state-machine'
import { parseLabel, buildBatchLabel } from '@/lib/batch-target-month'

export type FinalizeChoice =
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
 *
 * Cross-tenant scope: `actorOrganizationId` is the actor's CURRENT active
 * org (from OrgContext). The service verifies the run belongs to that org
 * AND, for replace, that the user-supplied batchId belongs to the
 * run's client. Without these checks an authenticated AM in Org A could
 * pass a runId from Org B (read others' state) or a batchId from Org B
 * with choice='replace' (wipe their posts).
 */
export async function finalizePostGeneration({
  input,
  actorUserId,
  actorOrganizationId,
}: {
  input: FinalizeChoice
  actorUserId: string
  actorOrganizationId: string
}): Promise<FinalizeResult> {
  // Scoped lookup: returns null if the run belongs to a different org.
  // Treat as "not found" rather than 403 to avoid existence leak.
  const run = await findContentRunForOrg(input.runId, actorOrganizationId)
  if (!run) throw new Error('Run not found')

  const newPostIds = run.posts.map((p) => p.id)
  if (newPostIds.length === 0) {
    throw new Error('Run has no posts to attach')
  }

  // For replace, the user supplies the target batchId directly. Verify
  // it belongs to the run's client (and therefore the run's org). Without
  // this an AM could pass a batchId from a sibling client in the same org
  // and the deleteMany would wipe it.
  if (input.choice === 'replace') {
    const targetBatch = await db.batch.findUnique({
      where: { id: input.batchId },
      select: { clientId: true },
    })
    if (!targetBatch || targetBatch.clientId !== run.clientId) {
      throw new Error('Batch not found')
    }
  }

  let targetBatchId: string

  if (input.choice === 'replace') {
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

  // For 'replace', advance the batch sub-state to drafted (the existing
  // posts in the target were displaced; the new set is the working draft).
  if (input.choice === 'replace') {
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
  // Snapshot the Client's clientReviewEnabled onto the new Batch so
  // toggling the Client flag later does not retroactively reroute
  // batches already in flight.
  const client = await db.client.findUnique({
    where: { id: clientId },
    select: { clientReviewEnabled: true },
  })
  if (!client) {
    throw new Error(`Client ${clientId} not found in finalize-post-generation`)
  }
  // Pin currentRole to the step's expected role so the denormalized
  // Batch.currentRole field can never drift away from
  // HOLDER_ROLE[currentStep]. A fresh batch always starts at `copy`, so
  // the role is always `am`; inheriting the previous batch's role would
  // land the new copy-step batch with `designer` (or any other prior
  // role) and make BatchCard's role chip disagree with RelayTrack. See
  // Phase 2 item 8 audit doc (2026-06-01) for the failure mode.
  const newBatch = await db.batch.create({
    data: {
      clientId,
      label,
      currentStep: 'copy',
      currentSubState: 'drafted',
      currentHolder: anyBatch?.currentHolder ?? fallbackHolderId,
      currentRole: HOLDER_ROLE['copy'],
      clientReviewEnabled: client.clientReviewEnabled,
    },
  })
  // Seed the copy-step checklist. A pipeline-created batch starts AT `copy`
  // (the first working step), so no later Pass/Send-back ever transitions
  // INTO copy to trigger a reseed -- without this the batch sits on Copy
  // Review with zero checklist rows (and an incorrectly-enabled Pass, since
  // an empty required set is vacuously "all checked"). Mirrors the admin
  // create-batch path in relay-admin.ts. Sequential (no $transaction) to match
  // this file's create-then-attach style. (workflow-test #8)
  await seedChecklistForStep(db, newBatch.id, RelayStep.copy, client.clientReviewEnabled)
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
    where: { clientId, deletedAt: null },
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
