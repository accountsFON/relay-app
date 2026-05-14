'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireClientEditor } from '@/server/middleware/permissions'
import { db } from '@/db/client'
import {
  findContentRunForOrg,
  findMatchingBatchForRun,
} from '@/server/repositories/contentRuns'
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

  // Scope-check the run BEFORE the idempotency probe. Otherwise a cross-org
  // caller could pass a runId from another agency and the idempotency path
  // would leak whether that run's posts are attached (plus the batchId).
  const run = await findContentRunForOrg(input.runId, ctx.organizationDbId)
  if (!run) throw new Error('Run not found')

  // Idempotency guard: if this run's posts are already attached to a batch,
  // return the existing batchId rather than throwing. This handles the
  // cross-tab race where two InFlightChoiceModals fire simultaneously.
  const existingPost = await db.post.findFirst({
    where: { contentRunId: input.runId, batchId: { not: null } },
    select: { batchId: true },
  })
  if (existingPost?.batchId) {
    return { batchId: existingPost.batchId, alreadyFinalized: true }
  }

  const result = await finalizePostGeneration({
    input,
    actorUserId: ctx.userDbId,
    actorOrganizationId: ctx.organizationDbId,
  })
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
 *
 * Cross-tenant guard: refuses if the run belongs to a different
 * organization than the actor's current active org. Without this an AM in
 * Org A could flip autoFinalize on any run id from Org B.
 */
export async function deferFinalizeAction(runId: string): Promise<void> {
  const ctx = await requireClientEditor()
  const run = await findContentRunForOrg(runId, ctx.organizationDbId)
  if (!run) throw new Error('Run not found')
  await db.contentRun.update({
    where: { id: runId },
    data: { autoFinalize: true },
  })
}

/**
 * Look up an existing batch matching this client + targetMonth so the modal
 * can decide whether to show the choice prompt. Called as a server action
 * from the dialog after generation completes.
 *
 * Delegates to `findMatchingBatchForRun` in the repository layer, which is
 * also used by `listInFlightRuns` for the same lookup. The action wrapper
 * adds the auth gate and translates the `id` field to `batchId` for the
 * client-facing shape.
 *
 * Cross-tenant guard: returns null if the run is in a different
 * organization. Without this an AM in Org A could probe Org B's runs for
 * matching batches and leak batchId + label + postCount across tenants.
 */
export async function findMatchingBatchForRunAction(
  runId: string,
): Promise<{ batchId: string; label: string; postCount: number } | null> {
  const ctx = await requireClientEditor()
  const run = await findContentRunForOrg(runId, ctx.organizationDbId)
  if (!run) return null
  const match = await findMatchingBatchForRun(runId)
  if (!match) return null
  return { batchId: match.id, label: match.label, postCount: match.postCount }
}
