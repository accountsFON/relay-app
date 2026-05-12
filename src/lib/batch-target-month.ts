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
 *  - "Cedar Creek Dental May 2026" → "2026-05"  (trailing Month Year)
 *  - "April 2026"                  → "2026-04"
 *  - "April"                       → uses fallbackDate's year
 *  - "2026-04"                     → "2026-04"
 *  - anything else                 → null
 */
export function parseLabel(label: string, fallbackDate: Date): string | null {
  const lower = label.trim().toLowerCase()

  // Match "...prefix MonthName YYYY" — picks up the new "Client Name Month Year"
  // format alongside the legacy "April 2026".
  const trailingMonthYear = lower.match(/(?:^|\s)([a-z]+)\s+(\d{4})$/)
  if (trailingMonthYear) {
    const idx = MONTH_NAMES.indexOf(trailingMonthYear[1])
    if (idx >= 0) {
      return `${trailingMonthYear[2]}-${String(idx + 1).padStart(2, '0')}`
    }
  }

  // Match "April" alone (use fallbackDate's year)
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

/**
 * Render a YYYY-MM target month as "Month Year" (e.g. "May 2026"). Used when
 * building human-readable batch labels and modal headings.
 */
export function formatMonthYear(targetMonth: string): string {
  const [y, m] = targetMonth.split('-')
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Compose the canonical batch label "{Client Name} {Month Year}". Centralized
 * so every batch-creation site renders the same shape, and so parseLabel can
 * round-trip without ambiguity.
 */
export function buildBatchLabel(clientName: string, targetMonth: string): string {
  return `${clientName} ${formatMonthYear(targetMonth)}`
}
