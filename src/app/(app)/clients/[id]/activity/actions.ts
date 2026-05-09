/**
 * Activity server actions — Caleb-owned write surface for the comms layer.
 *
 * Spec: projects/relay-app/2026-05-09-activity-thread-plan.md § API surface
 *       projects/relay-app/2026-05-09-relay-workflow-design.md § Phase 2
 *
 * Behavior (V1):
 * - postCommentAction: writes one ActivityEvent (kind=comment) plus N Mention
 *   rows. Calls Rails's recordActivity() helper so the same code path that
 *   relay state events use also serves comments.
 * - markMentionReadAction / markAllMentionsReadAction: simple Mention.readAt
 *   updates scoped to the current user.
 *
 * Phase: signatures only now. Phase 2 wires:
 *   - import { recordActivity } from '@/server/services/activity' (Rails-owned)
 *   - import { markMentionRead } from '@/server/repositories/activityEvents'
 *   - parse @handles from body, resolve to userIds via Memberships
 *
 * Schema dep: ActivityEvent + Mention (Rails-owned). All bodies throw until
 *             Phase 0 schema lands and Phase 2 wires the helpers.
 */
'use server'

export interface PostCommentInput {
  clientId: string
  body: string
  /** Inferred server-side from @handles in body. Phase 2 fills this. */
  mentionedUserIds: string[]
}

export async function postCommentAction(
  _input: PostCommentInput
): Promise<{ id: string }> {
  // TODO Phase 2:
  //   const ctx = await requireClientEditor()
  //   const event = await recordActivity({
  //     clientId: input.clientId,
  //     actorId: ctx.userId,
  //     kind: 'comment',
  //     payload: { kind: 'comment', body: input.body, mentionedUserIds: input.mentionedUserIds },
  //   })
  //   for (const userId of input.mentionedUserIds) {
  //     await prisma.mention.create({ data: { activityEventId: event.id, mentionedUserId: userId } })
  //   }
  //   revalidatePath(`/clients/${input.clientId}`)
  //   return { id: event.id }
  throw new Error('postCommentAction: not implemented — waiting on Rails Phase 0 schema and Caleb Phase 2.')
}

export async function markMentionReadAction(_mentionId: string): Promise<void> {
  // TODO Phase 2:
  //   const ctx = await requireOrgContext()
  //   await markMentionRead(input.mentionId, ctx.userId)
  //   revalidatePath('/inbox')
  throw new Error('markMentionReadAction: not implemented — waiting on Rails Phase 0 schema and Caleb Phase 2.')
}

export async function markAllMentionsReadAction(): Promise<void> {
  // TODO Phase 2:
  //   const ctx = await requireOrgContext()
  //   await prisma.mention.updateMany({
  //     where: { mentionedUserId: ctx.userId, readAt: null },
  //     data: { readAt: new Date() },
  //   })
  //   revalidatePath('/inbox')
  throw new Error('markAllMentionsReadAction: not implemented — waiting on Rails Phase 0 schema and Caleb Phase 2.')
}
