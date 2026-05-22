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
 *  - Stems ending in digits ("N", "0N", "FON1", "FON_1", "fon-12") map
 *    to the Nth post when posts are sorted by postDate ascending
 *    (1-indexed). The trailing-digits fallback covers AM filenames
 *    that share a client-prefix (e.g., "FON1.jpg ... FON10.jpg") so
 *    drag-and-drop ordering Just Works without a rename pass.
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

  // Pattern 2: trailing digits map to 1-indexed position when posts are
  // sorted by postDate asc. Matches "1", "01", "FON1", "FON_1", etc.
  // Anchored at the end of the stem so middle-of-name digits do not
  // accidentally consume the position slot.
  const nMatch = stem.match(/(\d+)$/)
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
