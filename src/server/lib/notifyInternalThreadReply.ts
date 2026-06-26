import { db } from '@/db/client'
import { recordActivity } from '@/server/services/activity'

/**
 * An internal (Clerk-authenticated) user replied on an internal-review pin
 * thread; ping the right people via the header bell. Never throws.
 *
 * Targets = thread participants (distinct internal authors of existing comments)
 * ∪ the batch's current holder ∪ the resolved @-mentioned users, MINUS the
 * actor, deduped. If no one is left, nothing is recorded.
 *
 * The event payload carries `surface: 'internal_review'` (+ threadId/postId) so
 * the bell copy + deep link route to the internal review page.
 *
 * Spec: projects/relay-app/2026-06-26-internal-review-notifications-design.md
 *       § 3. Notify on internal reply
 */
export async function notifyInternalThreadReply(input: {
  threadId: string
  actorUserId: string
  mentionedUserIds: string[]
}): Promise<void> {
  try {
    const thread = await db.postThread.findUnique({
      where: { id: input.threadId },
      select: {
        postId: true,
        post: {
          select: {
            clientId: true,
            batch: { select: { currentHolder: true } },
          },
        },
      },
    })
    if (!thread?.post) return

    // Participants: distinct INTERNAL authors of existing comments on the
    // thread. Reviewer (magic-link) comments have authorId = null and are
    // skipped because they're not internal bell recipients.
    const comments = await db.postComment.findMany({
      where: { threadId: input.threadId, authorId: { not: null } },
      select: { authorId: true },
      distinct: ['authorId'],
    })
    const participantIds = comments
      .map((c) => c.authorId)
      .filter((id): id is string => Boolean(id))

    const holderUserId = thread.post.batch?.currentHolder ?? null

    const candidates = new Set<string>([
      ...participantIds,
      ...(holderUserId ? [holderUserId] : []),
      ...input.mentionedUserIds,
    ])
    candidates.delete(input.actorUserId)

    if (candidates.size === 0) return

    // Internal recipients only. The current holder is a client-role user while
    // the batch is at client_review, and a client-role Clerk user could have
    // authored a comment, so filter by role here (not just authorId != null)
    // to never write a Mention row pointing a client at an internal reply.
    const internal = await db.user.findMany({
      where: { id: { in: Array.from(candidates) }, role: { not: 'client' } },
      select: { id: true },
    })
    const targets = internal.map((u) => u.id)
    if (targets.length === 0) return

    await recordActivity({
      clientId: thread.post.clientId,
      postId: thread.postId,
      actorId: input.actorUserId,
      kind: 'post_comment_added',
      payload: {
        surface: 'internal_review',
        threadId: input.threadId,
        postId: thread.postId,
      },
      mentionedUserIds: targets,
    })
  } catch (err) {
    console.error('[notifyInternalThreadReply] failed', err)
  }
}
