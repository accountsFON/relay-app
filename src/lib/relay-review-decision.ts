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

export interface ReviewDecisionInput {
  decision: string
  suggestedCaption: string | null
  openPinCount: number
}

export interface ReviewSummaryCounts {
  approved: number
  changesRequested: number
  captionEdited: number
  totalPosts: number
}

/**
 * Summarize a client review into approved / changes / edits counts (P2 #27).
 * A post marked "approved" that carries feedback (a saved copy edit or an open
 * pin) is counted as `changesRequested`, NOT a clean approval, so the client
 * counter and the "all approved" gate match the submit routing
 * (`isApprovedWithFeedback`). `totalPosts` counts every item, incl. not_reviewed.
 */
export function summarizeReviewDecisions(
  items: ReadonlyArray<ReviewDecisionInput>,
): ReviewSummaryCounts {
  let approved = 0
  let changesRequested = 0
  let captionEdited = 0
  for (const it of items) {
    if (it.decision === 'approved') {
      if (isApprovedWithFeedback(it.decision, it.suggestedCaption, it.openPinCount)) {
        changesRequested += 1
      } else {
        approved += 1
      }
    } else if (it.decision === 'changes_requested') {
      changesRequested += 1
    } else if (it.decision === 'caption_edited') {
      captionEdited += 1
    }
  }
  return { approved, changesRequested, captionEdited, totalPosts: items.length }
}

/** The destination step for each verdict. */
export function targetStepForDecision(decision: ReviewDecision): RelayStep {
  return decision === 'approved'
    ? RelayStep.ready_to_schedule
    : RelayStep.implementing_revisions
}
