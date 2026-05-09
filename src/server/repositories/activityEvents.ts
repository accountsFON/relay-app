/**
 * Activity events repository — READ-side helpers (Caleb-owned).
 *
 * Spec: projects/relay-app/2026-05-09-activity-thread-plan.md § Repository
 *       projects/relay-app/2026-05-09-relay-workflow-design.md § Caleb-Surfaces
 *
 * Boundary:
 * - Caleb OWNS the read side (this file).
 * - Rails OWNS the write helper (`recordActivity` in src/server/services/activity.ts,
 *   to be added in Phase 1a). Caleb's postCommentAction calls Rails's recordActivity;
 *   never writes ActivityEvent rows directly.
 *
 * Permission scoping:
 * Per spec § Permission scoping, scoping piggybacks on findClientForUser.
 * Callers MUST verify client visibility before calling listActivityForClient.
 * This repo does not re-check org/scope; it queries by clientId directly.
 */
import { db } from '@/db/client'
import type {
  ActivityEventView,
  ActivityPayload,
  MentionInboxRow,
} from '@/components/activity/types'

export interface ListActivityOptions {
  limit?: number
  /** Cursor: only return events with createdAt < this. */
  before?: Date
}

export async function listActivityForClient(
  clientId: string,
  opts: ListActivityOptions = {}
): Promise<ActivityEventView[]> {
  const events = await db.activityEvent.findMany({
    where: {
      clientId,
      ...(opts.before && { createdAt: { lt: opts.before } }),
    },
    orderBy: { createdAt: 'desc' },
    take: opts.limit ?? 50,
    include: {
      actor: { select: { id: true, name: true, avatarUrl: true } },
    },
  })

  return events.map((e) => ({
    id: e.id,
    clientId: e.clientId,
    runId: e.runId,
    postId: e.postId,
    kind: e.kind,
    createdAt: e.createdAt,
    actor: e.actor
      ? { id: e.actor.id, name: e.actor.name, avatarUrl: e.actor.avatarUrl }
      : null,
    // Prisma's Json type widens to JsonValue; the runtime contract is
    // ActivityPayload (modeled or unmodeled-kind catch-all). We cast here.
    payload: e.payload as unknown as ActivityPayload,
  }))
}

export interface ListMentionsOptions {
  unreadOnly?: boolean
  limit?: number
}

export async function listMentionsForUser(
  userId: string,
  opts: ListMentionsOptions = {}
): Promise<MentionInboxRow[]> {
  const mentions = await db.mention.findMany({
    where: {
      mentionedUserId: userId,
      ...(opts.unreadOnly && { readAt: null }),
    },
    orderBy: { createdAt: 'desc' },
    take: opts.limit ?? 50,
    include: {
      event: {
        include: {
          actor: { select: { id: true, name: true, avatarUrl: true } },
          client: { select: { id: true, name: true } },
        },
      },
    },
  })

  return mentions.map((m) => ({
    mentionId: m.id,
    readAt: m.readAt,
    client: { id: m.event.client.id, name: m.event.client.name },
    event: {
      id: m.event.id,
      clientId: m.event.clientId,
      runId: m.event.runId,
      postId: m.event.postId,
      kind: m.event.kind,
      createdAt: m.event.createdAt,
      actor: m.event.actor
        ? {
            id: m.event.actor.id,
            name: m.event.actor.name,
            avatarUrl: m.event.actor.avatarUrl,
          }
        : null,
      payload: m.event.payload as unknown as ActivityPayload,
      myMention: { id: m.id, readAt: m.readAt },
    },
  }))
}

export async function unreadMentionCount(userId: string): Promise<number> {
  return db.mention.count({
    where: { mentionedUserId: userId, readAt: null },
  })
}

export async function markMentionRead(
  mentionId: string,
  userId: string
): Promise<void> {
  await db.mention.updateMany({
    where: { id: mentionId, mentionedUserId: userId },
    data: { readAt: new Date() },
  })
}
