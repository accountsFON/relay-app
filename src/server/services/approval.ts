import { db } from '@/db/client'

/**
 * Approval state for a single post. Per design § Approval derivation:
 * `pending` if any open thread exists, `ready` otherwise. Never stored
 * on Post; always derived at query time.
 */
export type PostApproval = 'ready' | 'pending'

export async function derivePostApproval(postId: string): Promise<PostApproval> {
  const openCount = await db.postThread.count({
    where: { postId, status: 'open' },
  })
  return openCount > 0 ? 'pending' : 'ready'
}

export interface BatchApprovalCounts {
  ready: number
  pending: number
}

/**
 * Aggregate ready vs pending post counts for a batch. A post with zero
 * threads is `ready`; any single open thread flips it to `pending`.
 */
export async function derivePostApprovalForBatch(
  batchId: string,
): Promise<BatchApprovalCounts> {
  // Pull all postIds in the batch, then group open-thread counts by postId.
  // Two queries is fine at v1 scale (a batch is ~10-30 posts).
  const posts = await db.post.findMany({
    // Exclude soft-deleted posts so the count matches the feed (which filters
    // `deletedAt: null`); otherwise the hero subtitle over-counts.
    where: { batchId, deletedAt: null },
    select: { id: true },
  })
  if (posts.length === 0) return { ready: 0, pending: 0 }

  const postIds = posts.map((p) => p.id)
  const grouped = await db.postThread.groupBy({
    by: ['postId'],
    where: { postId: { in: postIds }, status: 'open' },
    _count: { _all: true },
  })

  const pendingPostIds = new Set(grouped.map((g) => g.postId))
  let pending = 0
  let ready = 0
  for (const p of posts) {
    if (pendingPostIds.has(p.id)) pending++
    else ready++
  }
  return { ready, pending }
}
