import { RelayStep, RelayRole } from '@prisma/client'
import { CHECKLIST_SEED } from '@/lib/relay-checklists'
import type { DbClient, DbTx } from '@/db/client'

export { RelayStep, RelayRole }

type DbOrTx = DbClient | DbTx

export const HOLDER_ROLE: Record<RelayStep, RelayRole> = {
  [RelayStep.onboarding_gate]: RelayRole.admin,
  [RelayStep.copy]: RelayRole.am,
  [RelayStep.in_design]: RelayRole.designer,
  [RelayStep.designs_completed]: RelayRole.designer,
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

  { from: RelayStep.in_design, to: RelayStep.designs_completed, direction: 'forward' },
  { from: RelayStep.in_design, to: RelayStep.copy, direction: 'send_back' },

  { from: RelayStep.designs_completed, to: RelayStep.am_review_design, direction: 'forward' },
  { from: RelayStep.designs_completed, to: RelayStep.in_design, direction: 'send_back' },

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

export interface ValidateTransitionResult {
  ok: boolean
  direction?: TransitionDirection
  reason?: string
}

export function validateTransition(
  from: RelayStep,
  to: RelayStep,
): ValidateTransitionResult {
  const match = LEGAL_TRANSITIONS.find((t) => t.from === from && t.to === to)
  if (!match) {
    return {
      ok: false,
      reason: `Illegal transition: ${from} → ${to}`,
    }
  }
  return { ok: true, direction: match.direction }
}

export function legalNextSteps(from: RelayStep): LegalTransition[] {
  return LEGAL_TRANSITIONS.filter((t) => t.from === from)
}

export function legalSendBackTargets(from: RelayStep): RelayStep[] {
  return LEGAL_TRANSITIONS.filter(
    (t) => t.from === from && t.direction === 'send_back',
  ).map((t) => t.to)
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
