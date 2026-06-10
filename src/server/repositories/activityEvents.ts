/**
 * Activity events repository: READ-side helpers (Caleb-owned).
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
import { EventVisibility, Prisma } from '@prisma/client'
import { db } from '@/db/client'
import type {
  ActivityEventView,
  ActivityPayload,
  MentionInboxRow,
} from '@/components/activity/types'
import type { OrgContext } from '@/lib/types'

/**
 * Resolve the EventVisibility values a viewer is allowed to see.
 *
 * Spec § Future Features § Section 2 visibility rules:
 *   - client role               → public only
 *   - admin role / platform owner → public + internal + admin_only
 *   - everyone else (AM, designer) → public + internal
 *
 * Page level callers should compute this and pass the result as
 * `opts.visibilityFilter` to listActivityForClient / listMentionsForUser /
 * unreadMentionCount. Without the filter the queries return ALL
 * visibilities (backwards compatible default), which is wrong for
 * client-role viewers.
 */
export function visibilityForViewer(ctx: OrgContext): EventVisibility[] {
  if (ctx.platformOwner) {
    return [EventVisibility.public, EventVisibility.internal, EventVisibility.admin_only]
  }
  switch (ctx.role) {
    case 'admin':
      return [EventVisibility.public, EventVisibility.internal, EventVisibility.admin_only]
    case 'client':
      return [EventVisibility.public]
    case 'account_manager':
    case 'designer':
      return [EventVisibility.public, EventVisibility.internal]
  }
}

export interface ListActivityOptions {
  limit?: number
  /** Cursor: only return events with createdAt < this. */
  before?: Date
  /**
   * Visibility values the viewer is allowed to see. Compute via
   * `visibilityForViewer(ctx)` at the call site. Required for any read
   * surface that may be hit by a client-role user.
   */
  visibilityFilter?: EventVisibility[]
  /**
   * Optional date range to scope results to (e.g., from a global DateScope).
   * `from` is inclusive, `to` is exclusive. Either bound may be null.
   */
  dateRange?: { from: Date | null; to: Date | null }
}

export async function listActivityForClient(
  clientId: string,
  opts: ListActivityOptions = {}
): Promise<ActivityEventView[]> {
  const createdAt: { lt?: Date; gte?: Date } = {}
  if (opts.before) createdAt.lt = opts.before
  if (opts.dateRange?.from) createdAt.gte = opts.dateRange.from
  if (opts.dateRange?.to) {
    // If both `before` and dateRange.to are set, take the tighter bound.
    createdAt.lt = createdAt.lt && createdAt.lt < opts.dateRange.to
      ? createdAt.lt
      : opts.dateRange.to
  }
  const events = await db.activityEvent.findMany({
    where: {
      clientId,
      ...(Object.keys(createdAt).length > 0 && { createdAt }),
      ...(opts.visibilityFilter && { visibility: { in: opts.visibilityFilter } }),
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
  /**
   * Visibility filter for the underlying ActivityEvent. Defense in depth:
   * a client-role user should never see a mention on an internal event,
   * even if a server bug somehow created one.
   */
  visibilityFilter?: EventVisibility[]
  /**
   * Active organization context. Required to scope inbox results to the
   * agency the viewer is currently in. Without it, multi-org users (platform
   * owners, members of two agencies) leak mentions across orgs.
   */
  organizationId: string
  /**
   * Client-assignment scope (from getClientScopeFilter). Restricts mentions to
   * clients the viewer is allowed to see: an AM only their assigned clients, a
   * designer their designed clients, admins/owners all (empty filter). Merged
   * into the event's client filter so the inbox never surfaces a notification
   * for a client outside the viewer's scope.
   */
  clientScope?: Prisma.ClientWhereInput
}

export async function listMentionsForUser(
  userId: string,
  opts: ListMentionsOptions
): Promise<MentionInboxRow[]> {
  const eventScope: Record<string, unknown> = {
    client: { organizationId: opts.organizationId, ...opts.clientScope },
  }
  if (opts.visibilityFilter) {
    eventScope.visibility = { in: opts.visibilityFilter }
  }
  const mentions = await db.mention.findMany({
    where: {
      mentionedUserId: userId,
      ...(opts.unreadOnly && { readAt: null }),
      event: eventScope,
    },
    orderBy: { createdAt: 'desc' },
    take: opts.limit ?? 50,
    include: {
      event: {
        include: {
          actor: { select: { id: true, name: true, avatarUrl: true } },
          client: { select: { id: true, name: true } },
          // Post's batch lets the deep link route to the batch page and
          // scroll to the post card for post-targeted events.
          post: { select: { batchId: true } },
        },
      },
    },
  })

  return mentions.map((m) => ({
    mentionId: m.id,
    readAt: m.readAt,
    client: { id: m.event.client.id, name: m.event.client.name },
    postBatchId: m.event.post?.batchId ?? null,
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

export async function unreadMentionCount(
  userId: string,
  organizationId: string,
  visibilityFilter?: EventVisibility[],
  clientScope?: Prisma.ClientWhereInput,
): Promise<number> {
  const eventScope: Record<string, unknown> = {
    client: { organizationId, ...clientScope },
  }
  if (visibilityFilter) {
    eventScope.visibility = { in: visibilityFilter }
  }
  return db.mention.count({
    where: {
      mentionedUserId: userId,
      readAt: null,
      event: eventScope,
    },
  })
}

/**
 * Total mention count for a user (all read states), scoped to the active org
 * and the viewer's client scope. Powers the "Clear all" dialog count so it
 * reflects exactly what the (now paginated, scoped) inbox would clear.
 */
export async function mentionCountForUser(
  userId: string,
  organizationId: string,
  visibilityFilter?: EventVisibility[],
  clientScope?: Prisma.ClientWhereInput,
): Promise<number> {
  const eventScope: Record<string, unknown> = {
    client: { organizationId, ...clientScope },
  }
  if (visibilityFilter) {
    eventScope.visibility = { in: visibilityFilter }
  }
  return db.mention.count({
    where: {
      mentionedUserId: userId,
      event: eventScope,
    },
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

/**
 * Permanently delete a single mention (hard delete). Scoped to the owner so a
 * user can only clear their own; deleteMany makes a non-owned / stale id a
 * harmless no-op rather than a throw.
 */
export async function deleteMention(
  mentionId: string,
  userId: string
): Promise<void> {
  await db.mention.deleteMany({
    where: { id: mentionId, mentionedUserId: userId },
  })
}

/**
 * Permanently delete every mention belonging to the user within one org (the
 * "Clear all" inbox action). Scoped to the active org so it matches the inbox.
 */
export async function deleteAllMentionsForUser(
  userId: string,
  organizationId: string,
  clientScope?: Prisma.ClientWhereInput,
): Promise<void> {
  await db.mention.deleteMany({
    where: {
      mentionedUserId: userId,
      event: { client: { organizationId, ...clientScope } },
    },
  })
}
