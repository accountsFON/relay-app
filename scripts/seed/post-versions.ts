/**
 * Demo seed: PostVersion snapshots on 3 specific posts so the version
 * history toggle has real content. One Cedar Creek, one Apex Plumbing,
 * one Riverbend Realty. The Riverbend post is seeded near the 50 cap so
 * the trim path is testable in the UI.
 *
 * Idempotent: wipes existing PostVersion rows on the targeted posts and
 * re creates them. Determinism guarded by mtime offsets in seconds.
 */
import type { DbClient } from '@/db/client'
import type { SeededContentRun } from './content-runs'
import type { SeededClient } from './clients'
import type { SeededUserMap } from './users'

interface SnapshotTarget {
  clientIdx: number
  /** Number of PostVersion rows to seed for the target post. */
  versionCount: number
}

const TARGETS: SnapshotTarget[] = [
  { clientIdx: 1, versionCount: 6 },
  { clientIdx: 2, versionCount: 7 },
  { clientIdx: 4, versionCount: 47 },
]

const REVISION_PREFIXES = [
  'v1 draft',
  'v2 tightening',
  'v3 with brand voice pass',
  'v4 incorporating client feedback',
  'v5 cleanup',
  'v6 polish',
  'v7 final pass',
  'v8 follow up edit',
]

function buildCaption(base: string, idx: number): string {
  const prefix = REVISION_PREFIXES[idx % REVISION_PREFIXES.length]
  return `[${prefix}] ${base}`
}

interface PostVersionsResult {
  totalRows: number
  postsTouched: number
}

export async function seedPostVersions(
  db: DbClient,
  clients: SeededClient[],
  runs: SeededContentRun[],
  org: SeededUserMap,
): Promise<PostVersionsResult> {
  let totalRows = 0
  let postsTouched = 0

  for (const target of TARGETS) {
    const client = clients.find((c) => c.idx === target.clientIdx)
    if (!client) continue

    const clientRuns = runs.filter((r) => r.clientId === client.id)
    if (clientRuns.length === 0) continue

    const latestRun = clientRuns.sort((a, b) =>
      a.targetMonth.localeCompare(b.targetMonth),
    )[clientRuns.length - 1]

    const postId = latestRun.postIds[Math.min(4, latestRun.postIds.length - 1)]
    if (!postId) continue

    const post = await db.post.findUnique({
      where: { id: postId },
      select: {
        caption: true,
        hashtags: true,
        graphicHook: true,
        designerNotes: true,
      },
    })
    if (!post) continue

    await db.postVersion.deleteMany({ where: { postId } })

    const baseTimestamp = Date.now()
    for (let i = 0; i < target.versionCount; i += 1) {
      const offsetMs = (target.versionCount - i) * 60_000
      await db.postVersion.create({
        data: {
          postId,
          authorId: i % 2 === 0 ? org.users.am1.id : org.users.designer1.id,
          caption: buildCaption(post.caption, i),
          hashtags: post.hashtags,
          graphicHook: post.graphicHook,
          designerNotes: post.designerNotes,
          createdAt: new Date(baseTimestamp - offsetMs),
        },
      })
      totalRows += 1
    }
    postsTouched += 1
  }

  return { totalRows, postsTouched }
}
