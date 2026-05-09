/**
 * Activity events repository — READ-side helpers (Caleb-owned).
 *
 * Spec: projects/relay-app/2026-05-09-activity-thread-plan.md § Repository
 *       projects/relay-app/2026-05-09-relay-workflow-design.md § Caleb-Surfaces
 *
 * Boundary:
 * - Caleb OWNS the read side (this file).
 * - Rails OWNS the write helper (`recordActivity` in src/server/services/activity.ts).
 *   Caleb's postCommentAction calls Rails's recordActivity; never writes
 *   ActivityEvent rows directly.
 *
 * Phase: signatures only now. Phase 1b wires listActivityForClient.
 *        Phase 2 wires the Mention helpers.
 *
 * Schema dep: ActivityEvent + Mention models (Rails-owned). All function
 *             bodies throw until Phase 0 schema is on main.
 */
import type {
  ActivityEventView,
  MentionInboxRow,
} from '@/components/activity/_placeholder-types'

export interface ListActivityOptions {
  limit?: number
  /** Cursor: only return events with createdAt < this. */
  before?: Date
}

export async function listActivityForClient(
  _clientId: string,
  _opts: ListActivityOptions = {}
): Promise<ActivityEventView[]> {
  // TODO Phase 1b:
  //   const events = await prisma.activityEvent.findMany({
  //     where: { clientId, ...(opts.before && { createdAt: { lt: opts.before } }) },
  //     orderBy: { createdAt: 'desc' },
  //     take: opts.limit ?? 50,
  //     include: { actor: true },
  //   })
  //   return events.map(toView)
  throw new Error('listActivityForClient: not implemented — waiting on Rails Phase 0 schema.')
}

export interface ListMentionsOptions {
  unreadOnly?: boolean
  limit?: number
}

export async function listMentionsForUser(
  _userId: string,
  _opts: ListMentionsOptions = {}
): Promise<MentionInboxRow[]> {
  // TODO Phase 2:
  //   const mentions = await prisma.mention.findMany({
  //     where: { mentionedUserId: userId, ...(opts.unreadOnly && { readAt: null }) },
  //     orderBy: { createdAt: 'desc' },
  //     take: opts.limit ?? 50,
  //     include: { event: { include: { actor: true, client: true } } },
  //   })
  //   return mentions.map(toInboxRow)
  throw new Error('listMentionsForUser: not implemented — waiting on Rails Phase 0 schema.')
}

export async function unreadMentionCount(_userId: string): Promise<number> {
  // TODO Phase 2:
  //   return prisma.mention.count({ where: { mentionedUserId: userId, readAt: null } })
  return 0
}

export async function markMentionRead(
  _mentionId: string,
  _userId: string
): Promise<void> {
  // TODO Phase 2:
  //   await prisma.mention.updateMany({
  //     where: { id: mentionId, mentionedUserId: userId },
  //     data: { readAt: new Date() },
  //   })
  throw new Error('markMentionRead: not implemented — waiting on Rails Phase 0 schema.')
}
