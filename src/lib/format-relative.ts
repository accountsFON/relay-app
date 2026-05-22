/**
 * Shared relative-time formatter used by the inbox, notification bell,
 * activity feed, search results, and post version history.
 *
 * Returns:
 *   - "just now"          for diffs under 60 seconds
 *   - "Nm ago"            for diffs under 1 hour
 *   - "Nh ago"            for diffs under 1 day
 *   - "Nd ago"            for diffs under 1 week
 *   - locale date string  for everything older
 *
 * Accepts both `Date` and ISO `string` inputs so callers can pass either
 * the Prisma `createdAt` column or the serialized DTO field directly.
 */
export function formatRelative(input: Date | string): string {
  const date = input instanceof Date ? input : new Date(input)
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}

/**
 * Calendar-day variant for "imported X" / "created X" semantics where
 * today/yesterday read more naturally than hour-level granularity.
 *
 * Returns:
 *   - "today"             for days === 0
 *   - "yesterday"         for days === 1
 *   - "Nd ago"            for days under 7
 *   - locale date string  for everything older
 */
export function formatRelativeDays(input: Date | string): string {
  const date = input instanceof Date ? input : new Date(input)
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}
