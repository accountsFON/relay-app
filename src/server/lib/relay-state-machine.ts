import { RelayStep, RelayRole } from '@prisma/client'
import { CHECKLIST_SEED } from '@/lib/relay-checklists'
import type { DbClient, DbTx } from '@/db/client'
// Pure transition data + the derived LIVE_PIPELINE_STEPS live in the
// client-safe `@/lib/relay-transitions` module; imported for the db-aware
// helpers below and re-exported so existing importers keep working unchanged.
import {
  LEGAL_TRANSITIONS,
  LEGAL_TRANSITIONS_NO_REVIEW,
  LIVE_PIPELINE_STEPS,
} from '@/lib/relay-transitions'
import type { LegalTransition, TransitionDirection } from '@/lib/relay-transitions'

export { RelayStep, RelayRole }
export { LEGAL_TRANSITIONS, LEGAL_TRANSITIONS_NO_REVIEW, LIVE_PIPELINE_STEPS }
export type { LegalTransition, TransitionDirection }

type DbOrTx = DbClient | DbTx

/**
 * Step to holder role.
 *
 * `designs_completed` is a retired step (Phase 3 item 15, PR1 dropped it from
 * LEGAL_TRANSITIONS). The enum value is preserved so historical ActivityEvent
 * and RelayEvent rows render cleanly, and a backfill migration walks any
 * in-flight batches forward to `am_review_design`. The holder mapping stays
 * here so `holderRoleForStep()` keeps a total function over RelayStep, but no
 * live batch should ever sit on this step after the PR1 backfill runs. PR2
 * (Wave F5) will tombstone the enum value once the prod audit confirms zero
 * batches at this step.
 *
 * Pipeline rework (2026-06-22): `sent_to_client`, `client_decision`,
 * `ready_to_schedule`, and `final_qa_schedule` are retired steps kept for
 * historical rows. The two new live steps are `client_review` (client-held,
 * merges the old sent_to_client + client_decision) and `scheduling` (AM-held,
 * merges the old ready_to_schedule + final_qa_schedule).
 * `onboarding_gate` holder changed from admin to am.
 */
export const HOLDER_ROLE: Record<RelayStep, RelayRole> = {
  [RelayStep.onboarding_gate]: RelayRole.am, // CHANGED: was admin (pipeline rework)
  [RelayStep.copy]: RelayRole.am,
  [RelayStep.in_design]: RelayRole.designer,
  [RelayStep.designs_completed]: RelayRole.designer, // retired step, kept for historical rows
  [RelayStep.am_review_design]: RelayRole.am,
  [RelayStep.design_revisions]: RelayRole.designer, // retired (merge design steps 2026-06-26), kept for history
  [RelayStep.am_qa_pre_client]: RelayRole.am,
  [RelayStep.sent_to_client]: RelayRole.client, // retired, kept for history
  [RelayStep.client_decision]: RelayRole.client, // retired, kept for history
  [RelayStep.ready_to_schedule]: RelayRole.am, // retired, kept for history
  [RelayStep.implementing_revisions]: RelayRole.am, // Post Revision (designer has a lane)
  [RelayStep.revisions_complete]: RelayRole.am, // retired, kept for history
  [RelayStep.final_qa_schedule]: RelayRole.am, // retired, kept for history
  [RelayStep.completed]: RelayRole.am,
  [RelayStep.client_review]: RelayRole.client, // NEW
  [RelayStep.scheduling]: RelayRole.am, // NEW
}


export function transitionsFor(
  clientReviewEnabled: boolean,
): readonly LegalTransition[] {
  return clientReviewEnabled ? LEGAL_TRANSITIONS : LEGAL_TRANSITIONS_NO_REVIEW
}

export interface ValidateTransitionResult {
  ok: boolean
  direction?: TransitionDirection
  reason?: string
}

export function validateTransition(
  from: RelayStep,
  to: RelayStep,
  clientReviewEnabled: boolean,
): ValidateTransitionResult {
  const map = transitionsFor(clientReviewEnabled)
  const match = map.find((t) => t.from === from && t.to === to)
  if (!match) {
    return {
      ok: false,
      reason: `Illegal transition: ${from} -> ${to}`,
    }
  }
  return { ok: true, direction: match.direction }
}

export function legalNextSteps(
  from: RelayStep,
  clientReviewEnabled: boolean,
): LegalTransition[] {
  return transitionsFor(clientReviewEnabled).filter((t) => t.from === from) as LegalTransition[]
}

export function legalSendBackTargets(
  from: RelayStep,
  clientReviewEnabled: boolean,
): RelayStep[] {
  return transitionsFor(clientReviewEnabled)
    .filter((t) => t.from === from && t.direction === 'send_back')
    .map((t) => t.to)
}

export function holderRoleForStep(step: RelayStep): RelayRole {
  return HOLDER_ROLE[step]
}

/**
 * The checklist rows a batch should have at `step`: the static template rows
 * from CHECKLIST_SEED. The Pre-Client QA "Send review link" row was removed
 * (P1 #13); the final-QA once-over + send-link now live in the Design Review
 * transition confirm modal.
 */
export function checklistRowsForStep(
  batchId: string,
  step: RelayStep,
  // Retained for signature stability: reseed/seedChecklistForStep and their many
  // callers thread clientReviewEnabled positionally. Unused here since the QA
  // send-link row was removed (P1 #13); removing it would cascade across every
  // passBaton/sendBackBaton/migration caller, out of scope for this change.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  clientReviewEnabled: boolean,
): { batchId: string; step: RelayStep; label: string; required: boolean; checked: boolean }[] {
  const seed = CHECKLIST_SEED[step] ?? []
  return seed.map((item) => ({
    batchId,
    step,
    label: item.label,
    required: item.required ?? true,
    checked: false,
  }))
}

/**
 * Wipe + reseed a batch's checklist for the given step. Used on every
 * Pass and Send-Back so the destination starts fresh ("reset always",
 * locked decision #11). Caller must run inside a transaction.
 */
export async function reseedChecklistForStep(
  tx: DbOrTx,
  batchId: string,
  step: RelayStep,
  clientReviewEnabled: boolean,
): Promise<void> {
  await tx.checklistItem.deleteMany({ where: { batchId } })
  const data = checklistRowsForStep(batchId, step, clientReviewEnabled)
  if (data.length === 0) return
  await tx.checklistItem.createMany({ data })
}

export async function seedChecklistForStep(
  tx: DbOrTx,
  batchId: string,
  step: RelayStep,
  clientReviewEnabled: boolean,
): Promise<void> {
  const data = checklistRowsForStep(batchId, step, clientReviewEnabled)
  if (data.length === 0) return
  await tx.checklistItem.createMany({ data })
}

export async function wipeChecklistForBatch(
  tx: DbOrTx,
  batchId: string,
): Promise<void> {
  await tx.checklistItem.deleteMany({ where: { batchId } })
}

export function isChecklistComplete(
  items: { required: boolean; checked: boolean }[],
): boolean {
  return items.filter((i) => i.required).every((i) => i.checked)
}
