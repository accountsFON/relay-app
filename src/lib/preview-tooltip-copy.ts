/**
 * Hover-hint copy for the shared /preview action controls. One short
 * sentence per control, keyed by a stable control id.
 *
 * Voice-owned. Obey the Wave 4K copy rules when editing:
 *  - No em or en dashes.
 *  - No compound hyphens in body copy.
 *  - Keep each value under 80 characters.
 */
export const PREVIEW_TOOLTIP_COPY = {
  imageReplace: 'Swap in a new image for this post',
  bulkResolve: 'Mark every open feedback thread on this post resolved',
  markBatchReviewed: 'Finish your review and move this relay to the next step',
  commentImageRemove: 'Remove the attached image',
} as const

export type PreviewTooltipKey = keyof typeof PREVIEW_TOOLTIP_COPY
