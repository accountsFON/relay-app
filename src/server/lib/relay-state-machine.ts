import { RelayStep, RelayRole } from '@prisma/client'
import { CHECKLIST_SEED } from '@/lib/relay-checklists'
import type { DbClient, DbTx } from '@/db/client'

export { RelayStep, RelayRole }

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
 */
export const HOLDER_ROLE: Record<RelayStep, RelayRole> = {
  [RelayStep.onboarding_gate]: RelayRole.admin,
  [RelayStep.copy]: RelayRole.am,
  [RelayStep.in_design]: RelayRole.designer,
  [RelayStep.designs_completed]: RelayRole.designer, // retired step, kept for historical rows
  [RelayStep.am_review_design]: RelayRole.am,
  [RelayStep.design_revisions]: RelayRole.designer,
  [RelayStep.am_qa_pre_client]: RelayRole.am,
  [RelayStep.sent_to_client]: RelayRole.client,
  [RelayStep.client_decision]: RelayRole.client,
  [RelayStep.ready_to_schedule]: RelayRole.am,
  [RelayStep.implementing_revisions]: RelayRole.am,
  [RelayStep.revisions_complete]: RelayRole.am,
  [RelayStep.final_qa_schedule]: RelayRole.am,
  [RelayStep.completed]: RelayRole.am,
}

export type TransitionDirection = 'forward' | 'send_back' | 'revision' | 'auto'

export interface LegalTransition {
  from: RelayStep
  to: RelayStep
  direction: TransitionDirection
}

export const LEGAL_TRANSITIONS: readonly LegalTransition[] = [
  { from: RelayStep.onboarding_gate, to: RelayStep.copy, direction: 'forward' },

  { from: RelayStep.copy, to: RelayStep.in_design, direction: 'forward' },
  { from: RelayStep.copy, to: RelayStep.onboarding_gate, direction: 'send_back' },

  // Phase 3 item 15: designer hands directly to AM review. The retired
  // `designs_completed` step is no longer reachable as a forward target.
  // Designer self-correction stays as send_back to copy; the previous
  // `designs_completed -> in_design` send_back is gone with the step.
  { from: RelayStep.in_design, to: RelayStep.am_review_design, direction: 'forward' },
  { from: RelayStep.in_design, to: RelayStep.copy, direction: 'send_back' },

  { from: RelayStep.am_review_design, to: RelayStep.am_qa_pre_client, direction: 'forward' },
  { from: RelayStep.am_review_design, to: RelayStep.design_revisions, direction: 'send_back' },

  { from: RelayStep.design_revisions, to: RelayStep.am_review_design, direction: 'forward' },
  { from: RelayStep.design_revisions, to: RelayStep.am_qa_pre_client, direction: 'send_back' },

  { from: RelayStep.am_qa_pre_client, to: RelayStep.sent_to_client, direction: 'forward' },
  { from: RelayStep.am_qa_pre_client, to: RelayStep.design_revisions, direction: 'send_back' },

  { from: RelayStep.sent_to_client, to: RelayStep.client_decision, direction: 'auto' },
  { from: RelayStep.sent_to_client, to: RelayStep.am_qa_pre_client, direction: 'send_back' },
  { from: RelayStep.sent_to_client, to: RelayStep.revisions_complete, direction: 'send_back' },

  { from: RelayStep.client_decision, to: RelayStep.ready_to_schedule, direction: 'forward' },
  { from: RelayStep.client_decision, to: RelayStep.implementing_revisions, direction: 'forward' },
  { from: RelayStep.client_decision, to: RelayStep.sent_to_client, direction: 'send_back' },

  { from: RelayStep.ready_to_schedule, to: RelayStep.final_qa_schedule, direction: 'forward' },
  { from: RelayStep.ready_to_schedule, to: RelayStep.client_decision, direction: 'send_back' },

  { from: RelayStep.implementing_revisions, to: RelayStep.copy, direction: 'revision' },
  { from: RelayStep.implementing_revisions, to: RelayStep.design_revisions, direction: 'revision' },
  { from: RelayStep.implementing_revisions, to: RelayStep.revisions_complete, direction: 'auto' },
  { from: RelayStep.implementing_revisions, to: RelayStep.client_decision, direction: 'send_back' },

  { from: RelayStep.revisions_complete, to: RelayStep.sent_to_client, direction: 'forward' },
  { from: RelayStep.revisions_complete, to: RelayStep.final_qa_schedule, direction: 'forward' },
  { from: RelayStep.revisions_complete, to: RelayStep.implementing_revisions, direction: 'send_back' },

  { from: RelayStep.final_qa_schedule, to: RelayStep.completed, direction: 'forward' },
  { from: RelayStep.final_qa_schedule, to: RelayStep.ready_to_schedule, direction: 'send_back' },
  { from: RelayStep.final_qa_schedule, to: RelayStep.revisions_complete, direction: 'send_back' },

  { from: RelayStep.completed, to: RelayStep.final_qa_schedule, direction: 'send_back' },
] as const

export const LEGAL_TRANSITIONS_NO_REVIEW: readonly LegalTransition[] = [
  { from: RelayStep.onboarding_gate, to: RelayStep.copy, direction: 'forward' },

  { from: RelayStep.copy, to: RelayStep.in_design, direction: 'forward' },
  { from: RelayStep.copy, to: RelayStep.onboarding_gate, direction: 'send_back' },

  // Phase 3 item 15: designer hands directly to AM review. Mirrors the
  // FULL_TRACK change above.
  { from: RelayStep.in_design, to: RelayStep.am_review_design, direction: 'forward' },
  { from: RelayStep.in_design, to: RelayStep.copy, direction: 'send_back' },

  { from: RelayStep.am_review_design, to: RelayStep.am_qa_pre_client, direction: 'forward' },
  { from: RelayStep.am_review_design, to: RelayStep.design_revisions, direction: 'send_back' },

  { from: RelayStep.design_revisions, to: RelayStep.am_review_design, direction: 'forward' },
  { from: RelayStep.design_revisions, to: RelayStep.am_qa_pre_client, direction: 'send_back' },

  // CHANGED: skip the two client steps; land on ready_to_schedule
  { from: RelayStep.am_qa_pre_client, to: RelayStep.ready_to_schedule, direction: 'forward' },
  { from: RelayStep.am_qa_pre_client, to: RelayStep.design_revisions, direction: 'send_back' },

  // CHANGED: send back falls to am_qa_pre_client (was client_decision in full flow)
  { from: RelayStep.ready_to_schedule, to: RelayStep.final_qa_schedule, direction: 'forward' },
  { from: RelayStep.ready_to_schedule, to: RelayStep.am_qa_pre_client, direction: 'send_back' },

  { from: RelayStep.final_qa_schedule, to: RelayStep.completed, direction: 'forward' },
  { from: RelayStep.final_qa_schedule, to: RelayStep.ready_to_schedule, direction: 'send_back' },

  { from: RelayStep.completed, to: RelayStep.final_qa_schedule, direction: 'send_back' },
] as const

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
 * Wipe + reseed a batch's checklist for the given step. Used on every
 * Pass and Send-Back so the destination starts fresh ("reset always",
 * locked decision #11). Caller must run inside a transaction.
 */
export async function reseedChecklistForStep(
  tx: DbOrTx,
  batchId: string,
  step: RelayStep,
): Promise<void> {
  await tx.checklistItem.deleteMany({ where: { batchId } })
  const seed = CHECKLIST_SEED[step] ?? []
  if (seed.length === 0) return
  await tx.checklistItem.createMany({
    data: seed.map((item) => ({
      batchId,
      step,
      label: item.label,
      required: item.required ?? true,
    })),
  })
}

export async function seedChecklistForStep(
  tx: DbOrTx,
  batchId: string,
  step: RelayStep,
): Promise<void> {
  const seed = CHECKLIST_SEED[step] ?? []
  if (seed.length === 0) return
  await tx.checklistItem.createMany({
    data: seed.map((item) => ({
      batchId,
      step,
      label: item.label,
      required: item.required ?? true,
    })),
  })
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
