import { RelayStep } from '@prisma/client'

export type ReviewDecision = 'approved' | 'changes'

export interface ReviewDecisionSummary {
  approved: number
  changesRequested: number
  captionEdited: number
  totalPosts: number
}

/**
 * Map a submitted review summary to a batch-level verdict. Strict: a batch
 * only counts as approved when EVERY post was explicitly approved (no
 * changes, no caption edits, and no undecided posts). Anything else, including
 * a partially reviewed batch, is treated as needing revisions.
 */
export function mapReviewDecision(summary: ReviewDecisionSummary): ReviewDecision {
  const allApproved =
    summary.totalPosts > 0 &&
    summary.approved === summary.totalPosts &&
    summary.changesRequested === 0 &&
    summary.captionEdited === 0
  return allApproved ? 'approved' : 'changes'
}

/** The destination step for each verdict. */
export function targetStepForDecision(decision: ReviewDecision): RelayStep {
  return decision === 'approved'
    ? RelayStep.ready_to_schedule
    : RelayStep.implementing_revisions
}
