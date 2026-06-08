/**
 * Decide whether a horizontal swipe should dismiss the row. Only leftward
 * swipes (negative dragX) past `ratio` of the row width count, so a small
 * nudge during scrolling never clears. Width 0 is treated as "not enough".
 */
export function shouldDismiss(dragX: number, width: number, ratio = 0.45): boolean {
  if (width <= 0) return false
  return dragX < 0 && Math.abs(dragX) >= width * ratio
}
