/**
 * Derive the YYYY-MM target month for a batch.
 *
 * Source order:
 *  1. The run's targetMonth if a run is associated.
 *  2. Parse `batch.label` if it matches a known month format.
 *  3. Fall back to the current month.
 *
 * Needed because `Batch` has no `targetMonth` column, but the
 * generate modal and routing redirects need to know which month
 * the batch targets.
 */

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

export function resolveBatchTargetMonth(
  batch: { label: string; createdAt: Date },
  run: { targetMonth: string } | null,
  now: Date = new Date(),
): string {
  if (run?.targetMonth) return run.targetMonth

  const parsed = parseLabel(batch.label, batch.createdAt)
  if (parsed) return parsed

  return formatYearMonth(now)
}

/**
 * Parse a batch label into a YYYY-MM string, or return null if the label
 * cannot be interpreted as a calendar month.
 *
 * Handles:
 *  - "April 2026"  → "2026-04"
 *  - "April"       → uses fallbackDate's year
 *  - "2026-04"     → "2026-04"
 *  - anything else → null
 */
export function parseLabel(label: string, fallbackDate: Date): string | null {
  const lower = label.trim().toLowerCase()

  // Match "April 2026"
  const withYear = lower.match(/^([a-z]+)\s+(\d{4})$/)
  if (withYear) {
    const idx = MONTH_NAMES.indexOf(withYear[1])
    if (idx >= 0) return `${withYear[2]}-${String(idx + 1).padStart(2, '0')}`
  }

  // Match "April" (use fallbackDate's year)
  const monthOnly = lower.match(/^([a-z]+)$/)
  if (monthOnly) {
    const idx = MONTH_NAMES.indexOf(monthOnly[1])
    if (idx >= 0) return `${fallbackDate.getFullYear()}-${String(idx + 1).padStart(2, '0')}`
  }

  // Match "2026-04"
  const ymOnly = lower.match(/^(\d{4})-(\d{2})$/)
  if (ymOnly) return `${ymOnly[1]}-${ymOnly[2]}`

  return null
}

function formatYearMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
