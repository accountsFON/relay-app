import { NextRequest } from 'next/server'
import { requireOrgContext } from '@/server/middleware/auth'
import {
  listMentionsForUser,
  unreadMentionCount,
  visibilityForViewer,
} from '@/server/repositories/activityEvents'
import { renderSummary, resolveHref } from '@/lib/notification-copy'
import type { MentionInboxRow } from '@/components/activity/types'

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
    const [mentions, count] = await Promise.all([
      listMentionsForUser(ctx.userDbId, {
        organizationId: ctx.organizationDbId,
        limit: 10,
        unreadOnly: true,
        visibilityFilter: visibility,
      }),
      unreadMentionCount(ctx.userDbId, ctx.organizationDbId, visibility),
    ])
    const items: NotificationItemDTO[] = mentions.map(toDTO)
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
