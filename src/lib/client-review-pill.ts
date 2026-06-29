import type { ReviewSessionWithReviewer } from '@/server/repositories/reviewSessions'

export interface ClientReviewPill {
  session: ReviewSessionWithReviewer
  /** Posts the client left feedback on (changes, caption edits, or comments). */
  feedbackCount: number
}

const STATUS_RANK: Record<string, number> = {
  submitted: 2,
  in_progress: 1,
  superseded: 0,
}

/**
 * Collapse all of a batch's review sessions to the single CLIENT pill the AM
 * should see. Internal (AM<->designer) sessions are excluded -- they have their
 * own surface. Superseded rounds are hidden. Among the remaining client
 * sessions we surface the "current" one: highest round, then submitted over
 * in_progress, then most recent activity -- so stray duplicate round-1 rows
 * (from pre-fix re-confirms) collapse to the one real session. Returns null
 * when the batch has no client review session to show.
 */
export function selectClientReviewPill(
  sessions: ReviewSessionWithReviewer[],
): ClientReviewPill | null {
  const candidates = sessions.filter(
    (s) => s.kind === 'client' && s.status !== 'superseded',
  )
  if (candidates.length === 0) return null

  const chosen = [...candidates].sort((a, b) => {
    if (b.round !== a.round) return b.round - a.round
    const rank = (STATUS_RANK[b.status] ?? 0) - (STATUS_RANK[a.status] ?? 0)
    if (rank !== 0) return rank
    const bt = (b.submittedAt ?? b.startedAt).getTime()
    const at = (a.submittedAt ?? a.startedAt).getTime()
    return bt - at
  })[0]

  return { session: chosen, feedbackCount: countFeedbackPosts(chosen.items) }
}

/**
 * How many posts the client left feedback on: a non-approve verdict (changes
 * requested or caption edited) or a non-empty free-text comment. A clean
 * approve-all returns 0.
 */
export function countFeedbackPosts(
  items: { decision: string; comment: string | null }[],
): number {
  return items.filter(
    (it) =>
      it.decision === 'changes_requested' ||
      it.decision === 'caption_edited' ||
      (it.comment != null && it.comment.trim().length > 0),
  ).length
}
