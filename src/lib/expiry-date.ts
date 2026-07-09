/**
 * Small local-timezone date helpers for the review-link expiry date picker
 * (P2 #23). The `<input type="date">` value is a local `YYYY-MM-DD` string, so
 * all math here works in local calendar days (not UTC) to match what the AM
 * sees in the picker.
 */

/** Format a Date as a local `YYYY-MM-DD` (the value shape a date input uses). */
export function formatDateInputValue(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Return a new Date `n` calendar days after `d` (rolls months/years). */
export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

/**
 * Whole calendar days from `from`'s local midnight to the picked `YYYY-MM-DD`.
 * Same day → 0, tomorrow → 1, yesterday → -1. Rounds so a DST transition day
 * (23h/25h) still yields a whole-day count.
 */
export function daysUntilDate(dateStr: string, from: Date): number {
  const [y, m, day] = dateStr.split('-').map(Number)
  const picked = new Date(y, (m ?? 1) - 1, day ?? 1)
  const fromMidnight = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const MS_PER_DAY = 24 * 60 * 60 * 1000
  return Math.round((picked.getTime() - fromMidnight.getTime()) / MS_PER_DAY)
}
