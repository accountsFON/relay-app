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
  // Active pipeline steps (canonical rework names)
  [RelayStep.onboarding_gate]: 'Onboarding',
  [RelayStep.copy]: 'Copy Review',
  [RelayStep.in_design]: 'Initial Design',
  [RelayStep.am_review_design]: 'Design Review',
  [RelayStep.design_revisions]: 'Design Revision',
  [RelayStep.am_qa_pre_client]: 'Pre-Client QA',
  [RelayStep.implementing_revisions]: 'Post Revision',
  [RelayStep.client_review]: 'Client Review',
  [RelayStep.scheduling]: 'Scheduling',
  [RelayStep.completed]: 'Completed',
  // Retired steps (keep existing labels for historical rows)
  [RelayStep.designs_completed]: 'Design complete',
  [RelayStep.sent_to_client]: 'Sent to client',
  [RelayStep.client_decision]: 'Client review',
  [RelayStep.ready_to_schedule]: 'Ready to schedule',
  [RelayStep.revisions_complete]: 'Revisions complete',
  [RelayStep.final_qa_schedule]: 'Final QA and schedule',
}

/**
 * Resolve a label for a RelayStep value. Falls back to a humanized form of
 * the raw key when the value is not a known RelayStep (e.g. legacy payload
 * data, free-text sub-state strings).
 *
 * Pass `clientReviewEnabled` to get the dynamic Pre-Client QA / Final QA
 * label for `am_qa_pre_client`. Defaults to 'Pre-Client QA' when omitted.
 */
export function relayStepLabel(
  step: RelayStep | string | null | undefined,
  clientReviewEnabled?: boolean,
): string {
  if (step == null) return ''
  if (step === RelayStep.am_qa_pre_client && clientReviewEnabled === false) {
    return 'Final QA'
  }
  if (typeof step === 'string' && step in RELAY_STEP_LABELS) {
    return RELAY_STEP_LABELS[step as RelayStep]
  }
  // Fallback for unknown values: replace underscores with spaces.
  return String(step).replace(/_/g, ' ')
}

/**
 * Short, plain language descriptions for each RelayStep. Used in tooltips on
 * step pills, station headers, and the relay track so a teammate can hover
 * to learn what a step actually means without leaving the page.
 *
 * Voice rules: no em or en dashes, no compound hyphens in body copy, keep
 * each line under 80 characters.
 */
export const RELAY_STEP_DESCRIPTIONS: Record<RelayStep, string> = {
  [RelayStep.onboarding_gate]: 'Waiting on intake details before the relay can start',
  [RelayStep.copy]: 'Captions are being drafted',
  [RelayStep.in_design]: 'Designer is building the visuals',
  [RelayStep.designs_completed]: 'Designs are finished and waiting for AM review',
  [RelayStep.am_review_design]: 'AM is reviewing the designs before client send',
  [RelayStep.design_revisions]: 'Designer is reworking visuals after AM feedback',
  [RelayStep.am_qa_pre_client]: 'AM runs the final QA pass before the client sees it',
  [RelayStep.sent_to_client]: 'Sent to the client for approval',
  [RelayStep.client_decision]: 'Waiting on the client to approve or request changes',
  [RelayStep.ready_to_schedule]: 'Approved by the client, ready to schedule',
  [RelayStep.implementing_revisions]: 'AM is addressing the client feedback',
  [RelayStep.revisions_complete]: 'Revisions are done and headed back for final QA',
  [RelayStep.final_qa_schedule]: 'Final QA before posts ship',
  [RelayStep.completed]: 'Relay is finished and ready to archive',
  [RelayStep.client_review]: 'With the client for approval or change requests',
  [RelayStep.scheduling]: 'AM is scheduling the approved posts',
}

/**
 * Resolve a description for a RelayStep value. Returns an empty string for
 * null, undefined, or unknown values so callers can safely render or skip.
 */
export function relayStepDescription(
  step: RelayStep | string | null | undefined,
): string {
  if (step == null) return ''
  if (typeof step === 'string' && step in RELAY_STEP_DESCRIPTIONS) {
    return RELAY_STEP_DESCRIPTIONS[step as RelayStep]
  }
  return ''
}
