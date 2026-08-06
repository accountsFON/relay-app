/**
 * Hover-hint copy for the client magic-link review controls. One short
 * sentence per control, keyed by a stable control id.
 *
 * Voice-owned. Obey the Wave 4K copy rules when editing:
 *  - No em or en dashes.
 *  - No compound hyphens in body copy.
 *  - Keep each value under 80 characters.
 */
export const CLIENT_REVIEW_TOOLTIP_COPY = {
  approveAll: 'Approve every post in this batch at once',
  submitReview: 'Send all your decisions back to the agency to finish',
  decisionApprove: 'Mark this post approved and ready to publish',
  decisionChanges: 'Ask for changes on this post before it goes live',
} as const

export type ClientReviewTooltipKey = keyof typeof CLIENT_REVIEW_TOOLTIP_COPY
