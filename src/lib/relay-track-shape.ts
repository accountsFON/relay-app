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

// Live steps only. Retired values (`designs_completed` per Phase 3 item 15 PR1;
// `sent_to_client`, `client_decision`, `ready_to_schedule`, `revisions_complete`,
// `final_qa_schedule` per the 2026-06-22 pipeline rework) are kept in the enum
// for historical rows but MUST stay out of these arrays: relay-track.tsx does
// `steps.indexOf(batch.currentStep)`, so a live step missing here resolves to -1
// and blanks the whole timeline (the bug when a batch advanced into
// client_review / scheduling).
// Merge design steps (2026-06-26): `design_revisions` is retired. Design Review
// (`am_review_design`) is one AM-held step; "Request changes" is an in-step
// action, not a separate timeline node.
export const FULL_TRACK: RelayStep[] = [
  RelayStep.onboarding_gate,
  RelayStep.copy,
  RelayStep.in_design,
  RelayStep.am_review_design,
  RelayStep.am_qa_pre_client,
  RelayStep.client_review, // merges old sent_to_client + client_decision
  RelayStep.implementing_revisions, // Post Revision (client-requested changes)
  RelayStep.scheduling, // merges old ready_to_schedule + final_qa_schedule
]

export const NO_REVIEW_TRACK: RelayStep[] = [
  RelayStep.onboarding_gate,
  RelayStep.copy,
  RelayStep.in_design,
  RelayStep.am_review_design,
  RelayStep.am_qa_pre_client,
  // No client review => no client_review step and no client-requested
  // post-revision (implementing_revisions); QA goes straight to scheduling.
  RelayStep.scheduling,
]

export function relayTrackFor(clientReviewEnabled: boolean): RelayStep[] {
  return clientReviewEnabled ? FULL_TRACK : NO_REVIEW_TRACK
}
