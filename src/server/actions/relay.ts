'use server'

import { revalidatePath } from 'next/cache'
import {
  type RelayStep,
} from '@prisma/client'
import { db } from '@/db/client'
import { requireCan } from '@/server/middleware/permissions'
import {
  finishBatch,
  forceStep,
  markDesignRevisionsDone,
  passBaton,
  requestDesignChanges,
  sendBackBaton,
} from '@/server/services/relay'
import { legalNextSteps } from '@/server/lib/relay-state-machine'
import { canOverrideHolder } from '@/lib/relay-holder-override'
import { notifyHolderOfBatonHandoff } from '@/server/lib/notifyHolderOfBatonHandoff'

/**
 * Cheap scoped lookup used by the action-layer holder gate. Throws the
 * same "Relay not found" the service would on cross-tenant access so the
 * gate cannot be used to probe existence across orgs.
 *
 * Also returns `clientId` so the action can scope `revalidatePath` to the
 * specific batch + client surfaces rather than blasting the whole app
 * layout cache. Per Phase 2 item 9 audit (2026-06-01): the previous
 * `revalidatePath('/', 'layout')` call forced a full RSC re-render of
 * the 9-query batch detail page on every pass, adding a measurable
 * second-plus delay on cold cache.
 */
async function loadHolderForGate(
  batchId: string,
  organizationDbId: string,
): Promise<{ currentHolder: string; clientId: string }> {
  const batch = await db.batch.findUnique({
    where: { id: batchId },
    select: {
      currentHolder: true,
      clientId: true,
      client: { select: { organizationId: true } },
    },
  })
  if (!batch || batch.client.organizationId !== organizationDbId) {
    throw new Error('Relay not found')
  }
  return { currentHolder: batch.currentHolder, clientId: batch.clientId }
}

/**
 * Standard revalidation set for any relay state machine transition. Pass,
 * send back, finish, dispatch, complete revision all mutate batch state +
 * may emit notifications, so they all need to invalidate the same four
 * surfaces:
 *
 * - The batch detail page (the surface the action shipped from).
 * - The parent client overview (lists batches for the client).
 * - The dashboard kanban (shows every batch across the org).
 * - The inbox (mention notifications fire on most state transitions).
 *
 * Conservative path selection: extra revalidation is harmless, missed
 * revalidation causes stale-data bugs the user has to hard-refresh to
 * clear. See Phase 2 item 9 audit doc.
 */
function revalidateBatchSurfaces(clientId: string, batchId: string) {
  revalidatePath(`/clients/${clientId}/batches/${batchId}`)
  revalidatePath(`/clients/${clientId}`)
  revalidatePath('/dashboard')
  revalidatePath('/inbox')
}

export async function passBatonAction(input: {
  batchId: string
  toStep: RelayStep
}) {
  const ctx = await requireCan('relay.pass')

  // Holder gate with AM / admin / platformOwner escape hatch. AMs and admins
  // can advance ANY batch, not just ones they currently hold (per 2026-05-21
  // meeting: "AM should be able to progress anything or reverse anything on
  // the run"). Designers + clients stay gated to holder. State-machine
  // legality is still enforced inside passBaton(); override bypasses only
  // the holder check.
  const holder = await loadHolderForGate(input.batchId, ctx.organizationDbId)
  const isOverride = ctx.userDbId !== holder.currentHolder
  if (
    isOverride &&
    !canOverrideHolder(ctx.role, ctx.platformOwner)
  ) {
    throw new Error(
      'Only the current holder, an AM, or an admin can advance this batch.',
    )
  }

  const result = await passBaton({
    batchId: input.batchId,
    toStep: input.toStep,
    actorId: ctx.userDbId,
    actorOrganizationId: ctx.organizationDbId,
    wasOverride: isOverride,
  })
  revalidateBatchSurfaces(holder.clientId, input.batchId)
  // Post-commit, best-effort: email the new holder that it's their turn.
  await notifyHolderOfBatonHandoff({
    batchId: input.batchId,
    clientId: holder.clientId,
    newHolderId: result.newHolderId,
    actorId: ctx.userDbId,
    toStep: input.toStep,
    direction: 'forward',
  })
  return result
}

/**
 * Terminal-state action: advances a batch from final_qa_schedule to completed.
 *
 * Permission: relay.pass (same as a regular forward Pass Baton, completing
 * is a forward direction in the state machine).
 * Checklist gating: UI-side only (ChecklistPanel disables the Finish button
 * until isChecklistComplete returns true). Matches passBatonAction pattern.
 */
export async function finishBatchAction(input: { batchId: string }) {
  const ctx = await requireCan('relay.pass')

  // Mirror the passBatonAction / sendBackBatonAction holder-override gate.
  // Finishing is a forward direction in the state machine ("move forward"
  // semantically covers finish), so AMs + admins can complete a batch they
  // do not currently hold. Designers + clients stay gated to holder.
  const holder = await loadHolderForGate(input.batchId, ctx.organizationDbId)
  const isOverride = ctx.userDbId !== holder.currentHolder
  if (
    isOverride &&
    !canOverrideHolder(ctx.role, ctx.platformOwner)
  ) {
    throw new Error(
      'Only the current holder, an AM, or an admin can finish this batch.',
    )
  }

  const result = await finishBatch({
    batchId: input.batchId,
    actorId: ctx.userDbId,
    actorOrganizationId: ctx.organizationDbId,
    wasOverride: isOverride,
  })
  revalidateBatchSurfaces(holder.clientId, input.batchId)
  return result
}

export async function sendBackBatonAction(input: {
  batchId: string
  toStep: RelayStep
  reason: string
}) {
  const ctx = await requireCan('relay.sendBack')

  // See passBatonAction above for the holder-override rationale.
  const holder = await loadHolderForGate(input.batchId, ctx.organizationDbId)
  const isOverride = ctx.userDbId !== holder.currentHolder
  if (
    isOverride &&
    !canOverrideHolder(ctx.role, ctx.platformOwner)
  ) {
    throw new Error(
      'Only the current holder, an AM, or an admin can send back this batch.',
    )
  }

  const result = await sendBackBaton({
    batchId: input.batchId,
    toStep: input.toStep,
    reason: input.reason,
    actorId: ctx.userDbId,
    actorOrganizationId: ctx.organizationDbId,
    wasOverride: isOverride,
  })
  revalidateBatchSurfaces(holder.clientId, input.batchId)
  // Post-commit, best-effort: email the new holder that the relay bounced
  // back to them for re-review , the case Caleb flagged (no email today).
  await notifyHolderOfBatonHandoff({
    batchId: input.batchId,
    clientId: holder.clientId,
    newHolderId: result.newHolderId,
    actorId: ctx.userDbId,
    toStep: input.toStep,
    direction: 'back',
    reason: input.reason,
  })
  return result
}

/**
 * Merge design steps (2026-06-26): "Request changes" on Design Review.
 *
 * In-step action (no baton handoff). Sets the batch sub-state to
 * `awaiting_design_revisions` and notifies the assigned designer; the batch
 * stays at am_review_design, AM-held. Same holder-override gate as
 * sendBackBatonAction (AM / admin can act on any batch they do not hold).
 *
 * Permission: `relay.sendBack` (requesting changes is the spiritual successor
 * to the old send-back-to-design-revision control).
 */
export async function requestDesignChangesAction(input: { batchId: string }) {
  const ctx = await requireCan('relay.sendBack')

  // See passBatonAction above for the holder-override rationale.
  const holder = await loadHolderForGate(input.batchId, ctx.organizationDbId)
  const isOverride = ctx.userDbId !== holder.currentHolder
  if (isOverride && !canOverrideHolder(ctx.role, ctx.platformOwner)) {
    throw new Error(
      'Only the current holder, an AM, or an admin can request design changes.',
    )
  }

  const result = await requestDesignChanges({
    batchId: input.batchId,
    actorId: ctx.userDbId,
    actorOrganizationId: ctx.organizationDbId,
  })
  revalidateBatchSurfaces(holder.clientId, input.batchId)
  return result
}

/**
 * Internal review parity Phase 3: the designer marks their revisions done.
 *
 * Inverse of requestDesignChangesAction. Clears the
 * `awaiting_design_revisions` sub-state on a batch at am_review_design and
 * notifies the assigned AM so they can open the next round + re-review on
 * `/preview`. The batch stays AM-held.
 *
 * Gate differs from requestDesignChangesAction: the batch is AM-held while
 * awaiting revisions, so the ASSIGNED DESIGNER (not the holder) must be
 * allowed to mark their own work done, alongside an AM / admin / platform
 * owner. The service enforces the step + sub-state guard and the cross-tenant
 * scope.
 *
 * Permission: `relay.pass` (NOT `relay.sendBack`). This action is FOR the
 * assigned designer, but `SYSTEM_DEFAULTS.designer['relay.sendBack'] === false`,
 * so gating on sendBack redirected the designer to /no-access before the
 * in-body `isAssignedDesigner || isHolder || canOverrideHolder` check ever
 * ran (C1 ship-blocker, 2026-06-29). `relay.pass` is true for designers, AMs,
 * and admins but false for clients, so the pre-gate fails closed against
 * clients while the body authorization still rejects an unassigned designer.
 */
export async function markDesignRevisionsDoneAction(input: { batchId: string }) {
  const ctx = await requireCan('relay.pass')

  // Load holder + assigned designer + org in one scoped read. Cross-tenant
  // access throws the same "Relay not found" as the other gates.
  const batch = await db.batch.findUnique({
    where: { id: input.batchId },
    select: {
      currentHolder: true,
      clientId: true,
      client: { select: { organizationId: true, assignedDesignerId: true } },
    },
  })
  if (!batch || batch.client.organizationId !== ctx.organizationDbId) {
    throw new Error('Relay not found')
  }

  const isAssignedDesigner = ctx.userDbId === batch.client.assignedDesignerId
  const isHolder = ctx.userDbId === batch.currentHolder
  if (
    !isAssignedDesigner &&
    !isHolder &&
    !canOverrideHolder(ctx.role, ctx.platformOwner)
  ) {
    throw new Error(
      'Only the assigned designer, an AM, or an admin can mark revisions done.',
    )
  }

  const openThreadCount = await db.postThread.count({
    where: { post: { batchId: input.batchId, deletedAt: null }, status: 'open' },
  })
  if (openThreadCount > 0) {
    throw new Error('Resolve all open threads before marking revisions done.')
  }

  const result = await markDesignRevisionsDone({
    batchId: input.batchId,
    actorId: ctx.userDbId,
    actorOrganizationId: ctx.organizationDbId,
  })
  revalidateBatchSurfaces(batch.clientId, input.batchId)
  return result
}

/**
 * Admin / platform owner override: force a batch to an arbitrary step,
 * bypassing the LEGAL_TRANSITIONS state machine. The service handles the
 * holder reassignment, RelayEvent, and force_step activity emission.
 *
 * Permission: `relay.forceStep` (admin + platform owner only). Unlike
 * pass / sendBack / finish, there is NO holder-override escape hatch here:
 * the matrix already denies AM / designer / client, so requireCan is the
 * entire gate. Do not add canOverrideHolder logic.
 */
export async function forceStepAction(input: {
  batchId: string
  toStep: RelayStep
  reason?: string
}) {
  const ctx = await requireCan('relay.forceStep')

  // Cheap scope lookup for revalidatePath targeting. The service runs its
  // own cross-tenant guard; this select only feeds the revalidation set.
  const scope = await db.batch.findUnique({
    where: { id: input.batchId },
    select: {
      clientId: true,
      client: { select: { organizationId: true } },
    },
  })
  if (!scope || scope.client.organizationId !== ctx.organizationDbId) {
    throw new Error('Relay not found')
  }

  const result = await forceStep({
    batchId: input.batchId,
    toStep: input.toStep,
    reason: input.reason,
    actorId: ctx.userDbId,
    actorOrganizationId: ctx.organizationDbId,
  })
  revalidateBatchSurfaces(scope.clientId, input.batchId)
  return result
}

/**
 * AM completion: advance a batch forward in the relay state machine, but only
 * once every thread on its posts is resolved. This is the gated "Mark relay
 * reviewed" action on /preview -- NOT a force-advance. If any thread is still
 * open it refuses; the button is also disabled client-side while open threads
 * remain (defense in depth). The admin force-step remains the deliberate
 * emergency escape hatch.
 *
 * Permission: `relay.pass` (a forward move in the state machine).
 */
export async function markBatchReviewedAction(input: { batchId: string }) {
  const ctx = await requireCan('relay.pass')

  // 1. Scope check + load current step. Cross-tenant treated as not found.
  const batch = await db.batch.findUnique({
    where: { id: input.batchId },
    select: {
      id: true,
      clientId: true,
      currentStep: true,
      clientReviewEnabled: true,
      client: { select: { organizationId: true } },
    },
  })
  if (!batch || batch.client.organizationId !== ctx.organizationDbId) {
    throw new Error('Relay not found')
  }

  // 2. Gate: refuse while any thread on any post in the batch is still open.
  const openThreadCount = await db.postThread.count({
    where: { post: { batchId: batch.id, deletedAt: null }, status: 'open' },
  })
  if (openThreadCount > 0) {
    throw new Error(
      'Resolve all open threads before marking the relay reviewed.',
    )
  }

  // 2b. Gate: refuse while any required checklist item for the current step is
  // unchecked (parity with the batch-page Pass button). Defense in depth: the
  // /preview button also gates client-side, but a bypassed UI can't skip this.
  const incompleteChecklistItems = await db.checklistItem.count({
    where: {
      batchId: batch.id,
      step: batch.currentStep,
      required: true,
      checked: false,
    },
  })
  if (incompleteChecklistItems > 0) {
    throw new Error(
      'Complete the review checklist before marking the relay reviewed.',
    )
  }

  // 3. Find the single forward step. Refuse if the step branches (the AM
  // should use Pass Baton to pick) or has no forward edge.
  const forwardSteps = legalNextSteps(
    batch.currentStep,
    batch.clientReviewEnabled,
  ).filter((t) => t.direction === 'forward')
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

  // 4. Advance via the same service the regular Pass Baton uses, so the state
  // machine, checklist reseed, RelayEvent, and batch_passed activity all run
  // unchanged. No auto-resolve, no force-advance activity -- this is a normal
  // forward move that just happens to be gated on resolution.
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

  revalidateBatchSurfaces(batch.clientId, batch.id)
  return advanceResult
}

/**
 * AM / admin / platformOwner toggle for the per-relay auto-advance opt-out.
 *
 * When `enabled` is false the daily autoAdvanceStaleReviews cron skips this
 * relay even after the org's review window has elapsed. Visible on the
 * ChecklistPanel when the relay is at the client_review step.
 *
 * Permission: `relay.pass` (same gate as forwarding the baton: AM and above).
 * No holder check is needed here because this is a settings toggle, not a
 * state machine transition.
 */
export async function setBatchAutoAdvanceAction(input: {
  batchId: string
  clientId: string
  enabled: boolean
}) {
  const ctx = await requireCan('relay.pass')
  const batch = await db.batch.findUnique({
    where: { id: input.batchId },
    select: { id: true, clientId: true, client: { select: { organizationId: true } } },
  })
  if (!batch || (batch.client.organizationId !== ctx.organizationDbId && !ctx.platformOwner)) {
    throw new Error('Relay not found')
  }
  await db.batch.update({
    where: { id: batch.id },
    data: { autoAdvanceOnTimeout: input.enabled },
  })
  revalidateBatchSurfaces(input.clientId, input.batchId)
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
    select: {
      currentHolder: true,
      clientId: true,
      client: { select: { organizationId: true } },
    },
  })
  // Org-scope check first (parity with markBatchReviewedAction): a foreign
  // itemId whose batch belongs to another org is treated as not found, before
  // the holder gate, so an overriding AM/admin can't tick across tenants and
  // the error doesn't leak the item's existence.
  if (!batch || batch.client.organizationId !== ctx.organizationDbId) {
    throw new Error('Relay not found')
  }
  // Holder-override gate, matching the page-level canAct flag and the
  // passBaton / sendBack / finish actions: the current holder ticks their
  // own items, and AM / admin / platformOwner can tick on any batch they do
  // not hold. Without this, the UI shows checkboxes to an overriding AM /
  // admin (canAct is true for them) but the tick action threw "only the
  // current holder", surfacing as a masked Server Components render error.
  if (
    batch.currentHolder !== ctx.userDbId &&
    !canOverrideHolder(ctx.role, ctx.platformOwner)
  ) {
    throw new Error(
      'Only the current holder, an AM, or an admin can tick checklist items',
    )
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
