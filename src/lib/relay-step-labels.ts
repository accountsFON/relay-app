/**
 * Human-readable labels for the RelayStep enum.
 *
 * The raw enum keys (e.g. `am_review_design`) are not safe to render in
 * user-facing copy. Use `relayStepLabel(step)` everywhere a step name
 * appears in the UI: activity thread rows, inbox summaries, kanban tiles,
 * step pills, batch header.
 *
 * Labels are voice-owned. Update with care.
 */
import { RelayStep } from '@prisma/client'

export const RELAY_STEP_LABELS: Record<RelayStep, string> = {
  [RelayStep.onboarding_gate]: 'Onboarding',
  [RelayStep.copy]: 'Copy',
  [RelayStep.in_design]: 'Design',
  [RelayStep.designs_completed]: 'Design complete',
  [RelayStep.am_review_design]: 'AM review (design)',
  [RelayStep.design_revisions]: 'Design revisions',
  [RelayStep.am_qa_pre_client]: 'Final QA before client',
  [RelayStep.sent_to_client]: 'Sent to client',
  [RelayStep.client_decision]: 'Client review',
  [RelayStep.ready_to_schedule]: 'Ready to schedule',
  [RelayStep.implementing_revisions]: 'Client revisions in progress',
  [RelayStep.revisions_complete]: 'Revisions complete',
  [RelayStep.final_qa_schedule]: 'Final QA and schedule',
}

/**
 * Resolve a label for a RelayStep value. Falls back to a humanized form of
 * the raw key when the value is not a known RelayStep (e.g. legacy payload
 * data, free-text sub-state strings).
 */
export function relayStepLabel(step: RelayStep | string | null | undefined): string {
  if (step == null) return ''
  if (typeof step === 'string' && step in RELAY_STEP_LABELS) {
    return RELAY_STEP_LABELS[step as RelayStep]
  }
  // Fallback for unknown values: replace underscores with spaces.
  return String(step).replace(/_/g, ' ')
}
