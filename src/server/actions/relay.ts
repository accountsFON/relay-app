'use server'

import { revalidatePath } from 'next/cache'
import {
  ActivityKind,
  EventVisibility,
  type RelayStep,
  type RevisionItemType,
} from '@prisma/client'
import { db } from '@/db/client'
import { requireCan } from '@/server/middleware/permissions'
import {
  completeRevisionItem,
  dispatchRevisions,
  finishBatch,
  passBaton,
  sendBackBaton,
} from '@/server/services/relay'
import { legalNextSteps } from '@/server/lib/relay-state-machine'
import { bulkResolveOnPost } from '@/server/repositories/threads'
import { recordActivity } from '@/server/services/activity'

export async function passBatonAction(input: {
  batchId: string
  toStep: RelayStep
}) {
  const ctx = await requireCan('relay.pass')
  const result = await passBaton({
    batchId: input.batchId,
    toStep: input.toStep,
    actorId: ctx.userDbId,
    actorOrganizationId: ctx.organizationDbId,
  })
  revalidatePath('/', 'layout')
  return result
}

/**
 * Terminal-state action: advances a batch from final_qa_schedule to completed.
 *
 * Permission: relay.pass (same as a regular forward Pass Baton — completing
 * is a forward direction in the state machine).
 * Checklist gating: UI-side only (ChecklistPanel disables the Finish button
 * until isChecklistComplete returns true). Matches passBatonAction pattern.
 */
export async function finishBatchAction(input: { batchId: string }) {
  const ctx = await requireCan('relay.pass')
  const result = await finishBatch({
    batchId: input.batchId,
    actorId: ctx.userDbId,
    actorOrganizationId: ctx.organizationDbId,
  })
  revalidatePath('/', 'layout')
  return result
}

export async function sendBackBatonAction(input: {
  batchId: string
  toStep: RelayStep
  reason: string
}) {
  const ctx = await requireCan('relay.sendBack')
  const result = await sendBackBaton({
    batchId: input.batchId,
    toStep: input.toStep,
    reason: input.reason,
    actorId: ctx.userDbId,
    actorOrganizationId: ctx.organizationDbId,
  })
  revalidatePath('/', 'layout')
  return result
}

export async function dispatchRevisionsAction(input: {
  batchId: string
  items: { type: RevisionItemType; description: string; assignedTo: string }[]
}) {
  const ctx = await requireCan('relay.composeRevisionPlan')
  const result = await dispatchRevisions({
    batchId: input.batchId,
    items: input.items,
    actorId: ctx.userDbId,
    actorOrganizationId: ctx.organizationDbId,
  })
  revalidatePath('/', 'layout')
  return result
}

export async function completeRevisionItemAction(input: { itemId: string }) {
  const ctx = await requireCan('relay.completeRevisionItem')
  const result = await completeRevisionItem({
    itemId: input.itemId,
    actorId: ctx.userDbId,
    actorOrganizationId: ctx.organizationDbId,
  })
  revalidatePath('/', 'layout')
  return result
}

export async function advanceCopySubStateAction(input: {
  batchId: string
  toSubState: 'generating' | 'drafted' | 'approved'
}) {
  const ctx = await requireCan('relay.pass')
  const batch = await db.batch.findUnique({
    where: { id: input.batchId },
    select: {
      id: true,
      currentStep: true,
      currentSubState: true,
      currentHolder: true,
    },
  })
  if (!batch) throw new Error('Relay not found')
  if (batch.currentStep !== 'copy') {
    throw new Error('Sub-state advance only valid at step copy')
  }
  if (batch.currentHolder !== ctx.userDbId && !ctx.platformOwner) {
    throw new Error('Only the current holder may advance sub-state')
  }
  if ((batch.currentSubState ?? 'generating') === input.toSubState) {
    return { ok: true as const, changed: false }
  }
  await db.batch.update({
    where: { id: batch.id },
    data: { currentSubState: input.toSubState },
  })
  revalidatePath('/', 'layout')
  return { ok: true as const, changed: true }
}

/**
 * AM override: force-advance a batch in the relay state machine and
 * auto-resolve any open threads on its posts with a reason note.
 *
 * Per design § AM overrides "Mark batch reviewed". Wraps the existing
 * passBaton / finishBatch service calls so the same checklist + activity
 * pipeline runs; this action just (a) bulk-resolves open threads first
 * (b) picks the next forward step automatically (c) emits a single
 * `batch_step_advanced` ActivityEvent so the audit trail names this as a
 * force-advance rather than a routine Pass Baton.
 *
 * Permission: `relay.pass` (same as a regular forward Pass Baton — this
 * is a forward direction in the state machine).
 */
export async function markBatchReviewedAction(input: {
  batchId: string
  reason: string
}) {
  const ctx = await requireCan('relay.pass')
  const trimmedReason = input.reason?.trim() ?? ''
  if (trimmedReason.length === 0) {
    throw new Error('Mark batch reviewed requires a reason note')
  }

  // 1. Scope check + load current step. Cross-tenant treated as not found.
  const batch = await db.batch.findUnique({
    where: { id: input.batchId },
    select: {
      id: true,
      clientId: true,
      currentStep: true,
      label: true,
      client: { select: { organizationId: true } },
    },
  })
  if (!batch || batch.client.organizationId !== ctx.organizationDbId) {
    throw new Error('Relay not found')
  }

  // 2. Find the next forward step. Refuse to auto-pick if the current step
  // branches (e.g. client_decision has two forward edges); the AM should
  // use the regular Pass Baton UI in those cases.
  const forwardSteps = legalNextSteps(batch.currentStep).filter(
    (t) => t.direction === 'forward',
  )
  if (forwardSteps.length === 0) {
    throw new Error(
      `Batch is at step ${batch.currentStep}; no forward step available to advance to`,
    )
  }
  if (forwardSteps.length > 1) {
    throw new Error(
      `Batch is at step ${batch.currentStep} with multiple forward branches; use Pass Baton to pick the destination`,
    )
  }
  const toStep = forwardSteps[0].to

  // 3. Auto-resolve open threads on every post in the batch with a tagged
  // reason. updateMany is the cheapest path; we do this BEFORE the batch
  // advance so even if the advance fails the reviewer audit trail is intact.
  const postIds = (
    await db.post.findMany({
      where: { batchId: batch.id },
      select: { id: true },
    })
  ).map((p) => p.id)

  const reasonNote = `Batch force-advanced: ${trimmedReason}`
  let resolvedCount = 0
  for (const postId of postIds) {
    const flipped = await bulkResolveOnPost({
      postId,
      resolvedBy: ctx.userDbId,
      resolvedReason: reasonNote,
    })
    resolvedCount += flipped
  }

  // 4. Advance via the same service the regular Pass Baton uses, so the
  // state machine, checklist reseed, RelayEvent, and batch_passed activity
  // all run unchanged.
  const advanceResult =
    toStep === 'completed'
      ? await finishBatch({
          batchId: batch.id,
          actorId: ctx.userDbId,
          actorOrganizationId: ctx.organizationDbId,
        })
      : await passBaton({
          batchId: batch.id,
          toStep,
          actorId: ctx.userDbId,
          actorOrganizationId: ctx.organizationDbId,
        })

  // 5. Emit a dedicated activity event so the audit trail names this as
  // a force-advance with the reason. Internal visibility so clients don't
  // see the override note.
  await recordActivity({
    clientId: batch.clientId,
    actorId: ctx.userDbId,
    kind: ActivityKind.batch_step_advanced,
    visibility: EventVisibility.internal,
    payload: {
      batchId: batch.id,
      batchLabel: batch.label,
      fromStep: batch.currentStep,
      toStep,
      reason: trimmedReason,
      resolvedThreadCount: resolvedCount,
      forceAdvanced: true,
    },
  })

  revalidatePath('/', 'layout')
  return {
    ...advanceResult,
    resolvedThreadCount: resolvedCount,
  }
}

export async function tickChecklistItemAction(input: {
  itemId: string
  checked: boolean
}) {
  const ctx = await requireCan('relay.pass')
  const item = await db.checklistItem.findUnique({
    where: { id: input.itemId },
    select: { id: true, batchId: true },
  })
  if (!item) throw new Error('Checklist item not found')
  const batch = await db.batch.findUnique({
    where: { id: item.batchId },
    select: { currentHolder: true, clientId: true },
  })
  if (!batch) throw new Error('Relay not found')
  if (batch.currentHolder !== ctx.userDbId && !ctx.platformOwner) {
    throw new Error('Only the current holder may tick checklist items')
  }

  await db.checklistItem.update({
    where: { id: item.id },
    data: input.checked
      ? { checked: true, checkedBy: ctx.userDbId, checkedAt: new Date() }
      : { checked: false, checkedBy: null, checkedAt: null },
  })
  revalidatePath(`/clients/${batch.clientId}/batches/${item.batchId}`)
  return { ok: true as const }
}
