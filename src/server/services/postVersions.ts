/**
 * PostVersion service: snapshot every save of post body, cap depth.
 *
 * Spec: projects/relay-app/2026-05-09-future-features-exploration.md § 2
 *
 * Capture semantics:
 * - One PostVersion per save, captures the WHOLE post body (caption,
 *   hashtags, graphicHook, designerNotes), not per-field deltas.
 * - Restore creates a new save (history is append-only).
 * - Cap at 50 versions per post; trim oldest in the same transaction.
 */
import { db } from '@/db/client'
import type { DbClient, DbTx } from '@/db/client'

type DbOrTx = DbClient | DbTx

const MAX_VERSIONS_PER_POST = 50

export interface PostBody {
  caption: string
  hashtags: string[]
  graphicHook: string | null
  designerNotes: string | null
}

/**
 * Snapshot the given post body into a new PostVersion row, then trim the
 * post's history to the most recent MAX_VERSIONS_PER_POST entries.
 *
 * MUST NOT throw on snapshot failure; logs and returns null so the upstream
 * mutation cannot be aborted by a versioning bug.
 */
export async function snapshotPostVersion(
  input: {
    postId: string
    authorId: string | null
    body: PostBody
  },
  tx?: DbOrTx,
): Promise<{ id: string } | null> {
  const client = tx ?? db
  try {
    const created = await client.postVersion.create({
      data: {
        postId: input.postId,
        authorId: input.authorId,
        caption: input.body.caption,
        hashtags: input.body.hashtags,
        graphicHook: input.body.graphicHook,
        designerNotes: input.body.designerNotes,
      },
      select: { id: true },
    })
    await trimVersionHistory(input.postId, client)
    return created
  } catch (err) {
    console.error('[postVersions] snapshot failed', {
      postId: input.postId,
      err: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

async function trimVersionHistory(postId: string, client: DbOrTx): Promise<void> {
  const total = await client.postVersion.count({ where: { postId } })
  if (total <= MAX_VERSIONS_PER_POST) return
  const toDelete = total - MAX_VERSIONS_PER_POST
  const oldest = await client.postVersion.findMany({
    where: { postId },
    orderBy: { createdAt: 'asc' },
    take: toDelete,
    select: { id: true },
  })
  if (oldest.length > 0) {
    await client.postVersion.deleteMany({
      where: { id: { in: oldest.map((v) => v.id) } },
    })
  }
}

export async function listVersionsForPost(postId: string) {
  return db.postVersion.findMany({
    where: { postId },
    orderBy: { createdAt: 'desc' },
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } },
    },
  })
}

export async function findVersion(versionId: string) {
  return db.postVersion.findUnique({
    where: { id: versionId },
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } },
    },
  })
}
