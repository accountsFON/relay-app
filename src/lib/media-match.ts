/**
 * Pure filename auto-matching for the bulk media upload tray.
 *
 * Extracted from `@/lib/media` so client components can import the matcher
 * without pulling in the Prisma client (which transitively imports `pg` and
 * fails the client bundle).
 *
 * Patterns:
 *  - "MM-DD.{ext}" matches the post whose postDate falls on month MM,
 *    day DD (year-agnostic, since a batch is scoped to a single month
 *    in practice).
 *  - "N.{ext}" or "0N.{ext}" matches the Nth post when posts are sorted
 *    by postDate ascending (1-indexed). Leading zeros are stripped.
 *
 * Returns the matching post id, or null if no match.
 */

export type MatchablePost = {
  id: string
  postDate: Date
}

export function matchFilenameToPost(
  filename: string,
  posts: ReadonlyArray<MatchablePost>,
): string | null {
  if (!filename || posts.length === 0) return null

  const dot = filename.lastIndexOf('.')
  const stem = dot >= 0 ? filename.slice(0, dot) : filename

  // Pattern 1: MM-DD (e.g., 05-12)
  const mmddMatch = stem.match(/^(\d{1,2})-(\d{1,2})$/)
  if (mmddMatch) {
    const month = parseInt(mmddMatch[1], 10)
    const day = parseInt(mmddMatch[2], 10)
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const found = posts.find((p) => {
        // Use UTC components since postDate is stored as UTC.
        return (
          p.postDate.getUTCMonth() + 1 === month &&
          p.postDate.getUTCDate() === day
        )
      })
      if (found) return found.id
    }
  }

  // Pattern 2: N or 0N (1-indexed position when sorted by postDate asc)
  const nMatch = stem.match(/^0*(\d+)$/)
  if (nMatch) {
    const n = parseInt(nMatch[1], 10)
    if (n >= 1) {
      const sorted = [...posts].sort(
        (a, b) => a.postDate.getTime() - b.postDate.getTime(),
      )
      const target = sorted[n - 1]
      if (target) return target.id
    }
  }

  return null
}
