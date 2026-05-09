/**
 * Global date scope used across surfaces (dashboard tiles, runs lists,
 * activity feed, search results).
 *
 * Spec: projects/relay-app/2026-05-09-future-features-exploration.md § 1
 *
 * Contract:
 * - URL params drive state. Refreshing without `scope` resets to default.
 * - Six presets, month-centric. `custom` carries `from` and `to`.
 * - `all_time` capped to last 2 years for performance per spec edge case.
 */

export type DateScopePreset =
  | 'this_month'
  | 'last_month'
  | 'last_3_months'
  | 'this_year'
  | 'all_time'
  | 'custom'

export interface DateScope {
  preset: DateScopePreset
  /** Inclusive lower bound. `null` for unbounded (only on all_time). */
  from: Date | null
  /** Exclusive upper bound. `null` for unbounded. */
  to: Date | null
}

export const DEFAULT_PRESET: DateScopePreset = 'this_month'

const PRESET_LABELS: Record<DateScopePreset, string> = {
  this_month: 'This month',
  last_month: 'Last month',
  last_3_months: 'Last 3 months',
  this_year: 'This year',
  all_time: 'All time',
  custom: 'Custom',
}

const PRESETS: DateScopePreset[] = [
  'this_month',
  'last_month',
  'last_3_months',
  'this_year',
  'all_time',
  'custom',
]

export function listDateScopePresets(): {
  preset: DateScopePreset
  label: string
}[] {
  return PRESETS.map((preset) => ({ preset, label: PRESET_LABELS[preset] }))
}

export function dateScopeLabel(scope: DateScope): string {
  if (scope.preset !== 'custom') return PRESET_LABELS[scope.preset]
  if (!scope.from || !scope.to) return 'Custom'
  return `${formatShort(scope.from)} – ${formatShort(scope.to)}`
}

export function defaultDateScope(now: Date = new Date()): DateScope {
  return resolveDateScope({ preset: DEFAULT_PRESET }, now)
}

/**
 * Parse a DateScope from URL search params (or any { scope, from, to } bag).
 * Falls back to default on missing or invalid input.
 */
export function parseDateScope(
  params:
    | URLSearchParams
    | { scope?: string | null; from?: string | null; to?: string | null }
    | undefined
    | null,
  now: Date = new Date(),
): DateScope {
  if (!params) return defaultDateScope(now)
  const scope =
    params instanceof URLSearchParams
      ? params.get('scope')
      : params.scope ?? null
  const fromRaw =
    params instanceof URLSearchParams ? params.get('from') : params.from ?? null
  const toRaw =
    params instanceof URLSearchParams ? params.get('to') : params.to ?? null

  if (scope === 'custom' && fromRaw && toRaw) {
    const from = parseISODate(fromRaw)
    const to = parseISODate(toRaw)
    if (from && to && from <= to) {
      // exclusive upper bound: bump `to` to next day
      return { preset: 'custom', from, to: addDays(to, 1) }
    }
    return defaultDateScope(now)
  }
  if (scope && (PRESETS as string[]).includes(scope)) {
    return resolveDateScope({ preset: scope as DateScopePreset }, now)
  }
  return defaultDateScope(now)
}

/**
 * Compute the {from, to} range for a preset (or pass through a custom range).
 */
export function resolveDateScope(
  input: { preset: DateScopePreset; from?: Date | null; to?: Date | null },
  now: Date = new Date(),
): DateScope {
  switch (input.preset) {
    case 'this_month': {
      const from = startOfMonth(now)
      const to = startOfMonth(addMonths(now, 1))
      return { preset: 'this_month', from, to }
    }
    case 'last_month': {
      const from = startOfMonth(addMonths(now, -1))
      const to = startOfMonth(now)
      return { preset: 'last_month', from, to }
    }
    case 'last_3_months': {
      const from = startOfMonth(addMonths(now, -2))
      const to = startOfMonth(addMonths(now, 1))
      return { preset: 'last_3_months', from, to }
    }
    case 'this_year': {
      const from = new Date(now.getFullYear(), 0, 1)
      const to = new Date(now.getFullYear() + 1, 0, 1)
      return { preset: 'this_year', from, to }
    }
    case 'all_time': {
      // Cap at 2 years per spec edge case for perf.
      const from = startOfMonth(addMonths(now, -24))
      return { preset: 'all_time', from, to: null }
    }
    case 'custom':
      return {
        preset: 'custom',
        from: input.from ?? null,
        to: input.to ?? null,
      }
  }
}

/** Serialize a DateScope into URL search params (only sets keys that change). */
export function serializeDateScope(scope: DateScope): Record<string, string> {
  if (scope.preset === DEFAULT_PRESET) return {}
  if (scope.preset === 'custom' && scope.from && scope.to) {
    return {
      scope: 'custom',
      from: toISODate(scope.from),
      // serialize the inclusive day, since `to` is stored exclusive
      to: toISODate(addDays(scope.to, -1)),
    }
  }
  return { scope: scope.preset }
}

/**
 * Does a `targetMonth` string (YYYY-MM) fall within the scope range?
 * Used for ContentRun filtering since runs are month-keyed, not timestamp-keyed.
 */
export function dateScopeIncludesMonth(
  scope: DateScope,
  targetMonth: string,
): boolean {
  const m = parseTargetMonth(targetMonth)
  if (!m) return true
  if (scope.from && m < startOfMonth(scope.from)) return false
  if (scope.to && m >= scope.to) return false
  return true
}

// --- helpers ---

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
function parseISODate(s: string): Date | null {
  // Expect YYYY-MM-DD
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const date = new Date(y, mo - 1, d)
  if (Number.isNaN(date.getTime())) return null
  return date
}
function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function parseTargetMonth(ym: string): Date | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, 1)
}
function formatShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
