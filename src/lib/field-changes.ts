// Server-free + Prisma-free: imported by server actions AND by client-side
// types (FieldChange). Pure value formatting + diffing for edit activity events.

export interface FieldChange {
  field: string
  from: string
  to: string
}

const MAX = 1000

/** Format any field value into a display-ready, length-capped string. */
export function formatFieldValue(value: unknown): string {
  let out: string
  if (value === null || value === undefined || value === '') out = '(empty)'
  else if (typeof value === 'boolean') out = value ? 'On' : 'Off'
  else if (Array.isArray(value)) out = value.length ? value.map((v) => String(v)).join(', ') : '(empty)'
  else out = String(value)
  return out.length > MAX ? out.slice(0, MAX) + '…' : out
}

/**
 * Optional override used to turn ids into names (assignedAmId -> "Caleb").
 * Return a string to override the default formatting, or undefined to fall
 * back to formatFieldValue(value).
 */
export type ValueResolver = (field: string, value: unknown) => string | undefined

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i])
  }
  return a === b
}

/**
 * Diffs `after` against `before`, returning a FieldChange per changed key with
 * display-ready from/to. Skips keys whose `after` value is undefined (partial
 * updates). `resolve` lets the caller map ids to names.
 */
export function diffFieldChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  resolve?: ValueResolver,
): FieldChange[] {
  const changes: FieldChange[] = []
  for (const [field, next] of Object.entries(after)) {
    if (next === undefined) continue
    const prior = before[field]
    if (valuesEqual(prior, next)) continue
    const from = resolve?.(field, prior) ?? formatFieldValue(prior)
    const to = resolve?.(field, next) ?? formatFieldValue(next)
    changes.push({ field, from, to })
  }
  return changes
}
