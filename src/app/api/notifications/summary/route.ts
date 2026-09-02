import { NextRequest } from 'next/server'
import { requireOrgContext } from '@/server/middleware/auth'
import { getClientScopeFilter } from '@/server/auth/scope'
import {
  listMentionsForUser,
  unreadMentionCount,
  visibilityForViewer,
} from '@/server/repositories/activityEvents'
import { renderSummary, resolveHref } from '@/lib/notification-copy'
import type { MentionInboxRow } from '@/components/activity/types'
import { notificationEmailTick } from '@/server/services/notificationEmailTick'

export interface NotificationItemDTO {
  eventId: string
  mentionId: string
  kind: string
  summary: string
  href: string
  createdAt: string
  runId: string | null
}

export interface NotificationSummaryDTO {
  count: number
  items: NotificationItemDTO[]
}

export async function GET(_req: NextRequest) {
  try {
    const ctx = await requireOrgContext()
    const visibility = visibilityForViewer(ctx)
    const clientScope = getClientScopeFilter(ctx)
    const [mentions, count] = await Promise.all([
      listMentionsForUser(ctx.userDbId, {
        organizationId: ctx.organizationDbId,
        limit: 10,
        unreadOnly: true,
        visibilityFilter: visibility,
        clientScope,
      }),
      unreadMentionCount(ctx.userDbId, ctx.organizationDbId, visibility, clientScope),
    ])
    const items: NotificationItemDTO[] = mentions.map(toDTO)

    // Tapper one for notification rollup emails. This poll is the app's own
    // metronome (every 20s per signed in user), so it doubles as the nudge
    // that gets teammates their email. The sweep is GLOBAL rather than scoped
    // to this caller, and that is the point: the person who caused a
    // notification is almost always still signed in, so their poll is what
    // mails the person who is away.
    //
    // notificationEmailTick opens with a cheap indexed probe and returns
    // after one lookup when nothing is due, which is the overwhelming
    // majority of calls. maxRecipients keeps the worst case bounded so a
    // burst cannot slow the bell down; the Trigger.dev tapper drains the
    // rest.
    //
    // Awaited rather than fired and forgotten, because an unawaited promise
    // can be killed when a serverless function returns. Wrapped in its own
    // try/catch so a mail problem can never turn a working bell into a 500.
    try {
      await notificationEmailTick({ maxRecipients: 5 })
    } catch (tapErr) {
      console.error('[notifications/summary] rollup tap failed', tapErr)
    }

    return Response.json(
      { count, items } satisfies NotificationSummaryDTO,
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    // requireOrgContext throws `new Error('Unauthorized')` when there's no
    // valid session. Surface that as a real 401 so the client can stop
    // polling instead of treating it as a transient offline error and
    // spamming the route every 20s from a backgrounded tab.
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[notifications/summary] fetch failed', err)
    return Response.json(
      { error: 'Notification fetch failed' },
      { status: 500 },
    )
  }
}

function toDTO(row: MentionInboxRow): NotificationItemDTO {
  return {
    eventId: row.event.id,
    mentionId: row.mentionId,
    kind: row.event.kind,
    summary: renderSummary(row),
    href: resolveHref(row),
    createdAt: row.event.createdAt.toISOString(),
    runId: row.event.runId ?? null,
  }
}
