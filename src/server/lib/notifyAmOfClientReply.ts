import { db } from '@/db/client'
import { recordActivity } from '@/server/services/activity'

/** A magic-link reviewer replied or pinned; ping the assigned AM via the bell. Never throws. */
export async function notifyAmOfClientReply(input: { threadId: string }): Promise<void> {
  try {
    const thread = await db.postThread.findUnique({
      where: { id: input.threadId },
      select: {
        postId: true,
        post: { select: { batch: { select: { client: { select: { id: true, assignedAmId: true } } } } } },
      },
    })
    const client = thread?.post?.batch?.client
    if (!thread || !client) return
    await recordActivity({
      clientId: client.id,
      postId: thread.postId,
      actorId: null,
      kind: 'post_comment_added',
      payload: { threadId: input.threadId, postId: thread.postId },
      mentionedUserIds: client.assignedAmId ? [client.assignedAmId] : [],
    })
  } catch (err) {
    console.error('[notifyAmOfClientReply] failed', err)
  }
}
