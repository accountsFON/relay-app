/**
 * Aspect-ratio clamps for Instagram + Facebook feed previews.
 *
 * Real IG feed accepts uploads from 1.91:1 (landscape) through 4:5 (portrait).
 * Anything wider or taller gets center-cropped by IG to the nearest bound. FB
 * feed renders images at their natural ratio with no equivalent hard clamp.
 *
 * The renderer combines these helpers with `object-cover` on the <img>: when
 * `displayRatio === naturalRatio` the image fills its box exactly; when the
 * helper clamps the natural ratio, the excess is cropped on the long edge.
 */

export const IG_MIN_ASPECT_RATIO = 4 / 5 // 0.8 (4:5 portrait, tallest IG allows)
export const IG_MAX_ASPECT_RATIO = 1.91 // 1.91:1 (widest IG allows)
export const IG_DEFAULT_ASPECT_RATIO = 1 // square placeholder while loading / when mediaUrl is null

export const FB_DEFAULT_ASPECT_RATIO = 1.91 // landscape default while loading / when mediaUrl is null

function isValidRatio(ratio: number | null | undefined): ratio is number {
  return typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0
}

export function clampInstagramAspectRatio(naturalRatio: number | null | undefined): number {
  if (!isValidRatio(naturalRatio)) return IG_DEFAULT_ASPECT_RATIO
  return Math.max(IG_MIN_ASPECT_RATIO, Math.min(IG_MAX_ASPECT_RATIO, naturalRatio))
}

export function facebookAspectRatio(naturalRatio: number | null | undefined): number {
  if (!isValidRatio(naturalRatio)) return FB_DEFAULT_ASPECT_RATIO
  return naturalRatio
}
