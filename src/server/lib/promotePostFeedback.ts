import { db } from '@/db/client'
import {
  findOpenPostLevelReviewerThread,
  createThread,
  addComment,
} from '@/server/repositories/threads'

export interface PromotePostFeedbackInput {
  reviewItemId: string
  amUserId: string
  body: string
  imageUrl?: string | null
  imageWidth?: number | null
  imageHeight?: number | null
}

export class ReviewItemNotFoundError extends Error {
  constructor(id: string) {
    super(`ReviewItem ${id} not found`)
    this.name = 'ReviewItemNotFoundError'
  }
}

/**
 * AM replies to a post whose only client feedback is a verdict + Notes (no
 * thread). Find-or-create a reviewer-attributed post-level thread seeded from
 * the client's Notes (or a synthesized opener), then append the AM reply.
 * Idempotent: a second reply reuses the same thread.
 */
export async function promotePostFeedbackToThread(
  input: PromotePostFeedbackInput,
): Promise<{ threadId: string }> {
  const ri = await db.reviewItem.findUnique({
    where: { id: input.reviewItemId },
    select: {
      postId: true,
      comment: true,
      reviewSession: {
        select: {
          magicLink: { select: { tokenHash: true, defaultReviewerName: true } },
          reviewer: { select: { name: true } },
        },
      },
    },
  })
  if (!ri) throw new ReviewItemNotFoundError(input.reviewItemId)

  const reviewerToken = ri.reviewSession.magicLink.tokenHash
  const reviewerName =
    ri.reviewSession.reviewer?.name ?? ri.reviewSession.magicLink.defaultReviewerName

  let threadId = await findOpenPostLevelReviewerThread({ postId: ri.postId, reviewerToken })
  if (!threadId) {
    const created = await createThread({
      postId: ri.postId,
      pin: { kind: 'post' },
      body: ri.comment?.trim() ? ri.comment : 'Requested changes',
      author: { kind: 'reviewer', reviewerToken, reviewerName },
    })
    threadId = created.threadId
  }

  await addComment({
    threadId,
    body: input.body,
    author: { kind: 'am', userId: input.amUserId },
    imageUrl: input.imageUrl ?? null,
    imageWidth: input.imageWidth ?? null,
    imageHeight: input.imageHeight ?? null,
  })

  return { threadId }
}
