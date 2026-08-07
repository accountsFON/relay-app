/**
 * Given posts already ordered the way the review UI orders them (postDate asc,
 * across one or more batches), return a map of postId -> 1-based position
 * within its own batch. Used to render "Post N" in notification copy so it
 * matches the number the user sees in the review surface.
 */
export function buildPostNumberMap(
  posts: ReadonlyArray<{ id: string; batchId: string | null }>,
): Map<string, number> {
  const perBatch = new Map<string, number>()
  const byId = new Map<string, number>()
  for (const p of posts) {
    if (!p.batchId) continue
    const n = (perBatch.get(p.batchId) ?? 0) + 1
    perBatch.set(p.batchId, n)
    byId.set(p.id, n)
  }
  return byId
}
