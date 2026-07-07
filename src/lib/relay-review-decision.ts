import { RelayStep } from '@prisma/client'

export type ReviewDecision = 'approved' | 'changes'

export interface ReviewDecisionCounts {
  approved: number
  changesRequested: number
  captionEdited: number
}

/**
 * Map a submitted review to a batch-level verdict. Strict: approved ONLY when
 * every post in the batch was explicitly approved. `batchPostCount` MUST be the
 * batch's post count, NOT the review summary's `totalPosts` (which counts only
 * the ReviewItems the reviewer touched — untouched posts have no item, so a
 * partial review would otherwise look fully approved and auto-schedule
 * unreviewed posts).
 */
export function mapReviewDecision(
  counts: ReviewDecisionCounts,
  batchPostCount: number,
): ReviewDecision {
  const allApproved =
    batchPostCount > 0 &&
    counts.approved === batchPostCount &&
    counts.changesRequested === 0 &&
    counts.captionEdited === 0
  return allApproved ? 'approved' : 'changes'
}

/**
 * True when a post the client marked "approved" nonetheless carries feedback
 * the AM must act on: a saved copy edit (`suggestedCaption`) or an open client
 * pin/thread. Such a post is NOT a clean approval (P1 #16) -- it routes the
 * batch to Client revisions and reads as "changes needed" on the AM side,
 * instead of auto-scheduling with a green Approved badge. One source of truth
 * for the submit-routing check and the AM verdict display.
 */
export function isApprovedWithFeedback(
  decision: string,
  suggestedCaption: string | null,
  openPinCount: number,
): boolean {
  return decision === 'approved' && (suggestedCaption != null || openPinCount > 0)
}

/** The destination step for each verdict. */
export function targetStepForDecision(decision: ReviewDecision): RelayStep {
  return decision === 'approved'
    ? RelayStep.ready_to_schedule
    : RelayStep.implementing_revisions
}
