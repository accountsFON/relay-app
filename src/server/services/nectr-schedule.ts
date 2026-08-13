/**
 * Schedule a batch's posts into the client's NECTR Social Planner via API, on the
 * relay-finish transition. Best-effort: never throws for expected conditions; a
 * failure must not roll back the relay completion. Idempotent via
 * Post.nectrScheduledId. The manual CSV export stays as a fallback.
 *
 * Spec: docs/superpowers/specs/2026-08-13-nectr-auto-scheduling-phase2-design.md
 */
import { db } from '@/db/client'
import { getAccounts, getUsers, pickServiceUserId, createPost, getLocation, NectrConfigError } from '@/lib/nectr-social'
import { buildContent } from '@/lib/social-planner-csv'

export type NectrScheduleResult =
  | { status: 'skipped'; reason: 'no-location' | 'not-configured' | 'no-accounts' | 'no-user' | 'no-posts' }
  | {
      status: 'ok' | 'partial' | 'failed'
      scheduled: number
      alreadyScheduled: number
      accounts: number
      failed: { post: string; reason: string }[]
    }

/**
 * The UTC instant for 8:00am on `postDate`'s calendar day (read in UTC) in
 * `timeZone`, as an ISO `.000Z` string. NECTR requires `.000Z` and honors it as
 * true UTC (Task 1 spike), so 8am-local must be converted to UTC. DST-aware via
 * Intl; 8am is far from the 2am DST boundary, so a single offset correction is
 * exact.
 */
export function buildNectrScheduleDate(postDate: Date, timeZone: string): string {
  const guessUtcMs = Date.UTC(
    postDate.getUTCFullYear(),
    postDate.getUTCMonth(),
    postDate.getUTCDate(),
    8,
    0,
    0,
  )
  const offsetMs = tzOffsetMs(timeZone, new Date(guessUtcMs))
  return new Date(guessUtcMs - offsetMs).toISOString().replace(/\.\d{3}Z$/, '.000Z')
}

/** Milliseconds `timeZone` is ahead of UTC at instant `at` (EDT => -14400000). */
function tzOffsetMs(timeZone: string, at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(at)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return asUtc - at.getTime()
}

function imageTypeFromUrl(url: string): string {
  const ext = url.split('?')[0].match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'image/jpeg'
}

export async function scheduleBatchToNectr(batchId: string): Promise<NectrScheduleResult> {
  const batch = await db.batch.findUnique({
    where: { id: batchId },
    select: { id: true, client: { select: { nectrLocationId: true } } },
  })
  const locationId = batch?.client.nectrLocationId?.trim()
  if (!locationId) return { status: 'skipped', reason: 'no-location' }

  let accounts, users, location
  try {
    ;[accounts, users, location] = await Promise.all([
      getAccounts(locationId),
      getUsers(locationId),
      getLocation(locationId),
    ])
  } catch (err) {
    if (err instanceof NectrConfigError) return { status: 'skipped', reason: 'not-configured' }
    throw err
  }

  const live = accounts.filter((a) => !a.isExpired)
  if (live.length === 0) return { status: 'skipped', reason: 'no-accounts' }
  const accountIds = live.map((a) => a.id)
  const userId = pickServiceUserId(users)
  if (!userId) return { status: 'skipped', reason: 'no-user' }
  // NECTR honors scheduleDate as true UTC, so 8am-local is converted using the
  // client location's timezone (fallback Eastern only if the location has none).
  const tz = location.timezone ?? 'America/New_York'

  const posts = await db.post.findMany({
    where: { batchId, deletedAt: null },
    orderBy: { postDate: 'asc' },
    select: { id: true, postDate: true, caption: true, hashtags: true, mediaUrls: true, nectrScheduledId: true },
  })
  if (posts.length === 0) return { status: 'skipped', reason: 'no-posts' }

  let scheduled = 0
  let alreadyScheduled = 0
  const failed: { post: string; reason: string }[] = []

  for (const post of posts) {
    if (post.nectrScheduledId) {
      alreadyScheduled++
      continue
    }
    try {
      const mediaUrl = post.mediaUrls[0]
      const { id } = await createPost(locationId, {
        accountIds,
        summary: buildContent(post.caption, post.hashtags.join(' ')),
        mediaUrl,
        mediaType: mediaUrl ? imageTypeFromUrl(mediaUrl) : undefined,
        scheduleDate: buildNectrScheduleDate(post.postDate, tz),
        userId,
      })
      await db.post.update({ where: { id: post.id }, data: { nectrScheduledId: id } })
      scheduled++
    } catch (err) {
      failed.push({ post: post.id, reason: err instanceof Error ? err.message : String(err) })
    }
  }

  const status = failed.length === 0 ? 'ok' : scheduled + alreadyScheduled > 0 ? 'partial' : 'failed'
  return { status, scheduled, alreadyScheduled, accounts: live.length, failed }
}
