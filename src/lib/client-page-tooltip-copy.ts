/**
 * Hover-hint copy for the client-page action controls. One short sentence per
 * control, keyed by a stable control id.
 *
 * Voice-owned. Obey the Wave 4K copy rules when editing:
 *  - No em or en dashes.
 *  - No compound hyphens in body copy.
 *  - Keep each value under 80 characters.
 */
export const CLIENT_PAGE_TOOLTIP_COPY = {
  sendToReview: 'Run the final QA before this relay moves on',
  approveSchedule: 'Approve this relay and send it straight to scheduling',
  requestChanges: 'Send this back to your team with notes on what to fix',
} as const

export type ClientPageTooltipKey = keyof typeof CLIENT_PAGE_TOOLTIP_COPY
