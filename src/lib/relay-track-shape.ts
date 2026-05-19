/**
 * Ordered step lists for the RelayTrack timeline. Each step's display
 * number is its array index + 1; the track's "X of Y" total is the
 * array length. Skipping steps in NO_REVIEW_TRACK is what makes the
 * track auto renumber for no review batches.
 *
 * The terminal step (RelayStep.completed) is intentionally NOT in either
 * array. The track renders pre completion only; completion is shown as
 * a separate banner.
 */
import { RelayStep } from '@prisma/client'

export const FULL_TRACK: RelayStep[] = [
  RelayStep.onboarding_gate,
  RelayStep.copy,
  RelayStep.in_design,
  RelayStep.designs_completed,
  RelayStep.am_review_design,
  RelayStep.design_revisions,
  RelayStep.am_qa_pre_client,
  RelayStep.sent_to_client,
  RelayStep.client_decision,
  RelayStep.ready_to_schedule,
  RelayStep.implementing_revisions,
  RelayStep.revisions_complete,
  RelayStep.final_qa_schedule,
]

export const NO_REVIEW_TRACK: RelayStep[] = [
  RelayStep.onboarding_gate,
  RelayStep.copy,
  RelayStep.in_design,
  RelayStep.designs_completed,
  RelayStep.am_review_design,
  RelayStep.design_revisions,
  RelayStep.am_qa_pre_client,
  RelayStep.ready_to_schedule,
  RelayStep.final_qa_schedule,
]

export function relayTrackFor(clientReviewEnabled: boolean): RelayStep[] {
  return clientReviewEnabled ? FULL_TRACK : NO_REVIEW_TRACK
}
