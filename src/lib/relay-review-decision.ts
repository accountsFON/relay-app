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

/** The destination step for each verdict. */
export function targetStepForDecision(decision: ReviewDecision): RelayStep {
  return decision === 'approved'
    ? RelayStep.ready_to_schedule
    : RelayStep.implementing_revisions
}
