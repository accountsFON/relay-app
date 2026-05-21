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
