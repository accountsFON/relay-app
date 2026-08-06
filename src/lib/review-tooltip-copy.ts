/**
 * Hover-hint copy for the staff review action controls. One short sentence
 * per control, keyed by a stable control id.
 *
 * Voice-owned. Obey the Wave 4K copy rules when editing:
 *  - No em or en dashes.
 *  - No compound hyphens in body copy.
 *  - Keep each value under 80 characters.
 */
export const REVIEW_TOOLTIP_COPY = {
  requestChanges: 'Send your feedback to the designer and start revisions',
  markAddressed: "Clear this post's feedback and mark it handled",
  markRevisionsDone: 'Tell the account manager your revisions are ready to review again',
  startNextRound: 'Close this review round and open the next one for the client',
} as const

export type ReviewTooltipKey = keyof typeof REVIEW_TOOLTIP_COPY
