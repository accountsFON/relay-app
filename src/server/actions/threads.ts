'use server'

import { revalidatePath } from 'next/cache'
import { getOrgContext } from '@/server/middleware/auth'
import { promotePostFeedbackToThread } from '@/server/lib/promotePostFeedback'
import { getMagicLinkReviewerFromCookie } from '@/server/auth/magic-link-reviewer'
import { requireCan } from '@/server/middleware/permissions'
import { db } from '@/db/client'
import {
  addComment,
  bulkResolveOnPost,
  createThread,
  listThreadsForBatch,
  listThreadsForPost,
  reopenThread,
  resolveThread,
  type HydratedThread,
  type ThreadActor,
} from '@/server/repositories/threads'
import type { PinLocation } from '@/types/preview'
import { isCommentImageBlobUrl } from '@/lib/comment-image'
import { attachMediaToPost } from '@/lib/media'
import { notifyClientOfAmReply } from '@/server/lib/notifyClientOfAmReply'
import { notifyInternalThreadReply } from '@/server/lib/notifyInternalThreadReply'
import { internalMentionRosterForClient } from '@/server/lib/internalMentionRoster'
import { resolveMentionedUserIds } from '@/lib/mentions'
import { assertBatchEditable } from '@/server/lib/relay-lock-guard'

type CommentImage = { url: string; width?: number; height?: number }

function validateImage(image: CommentImage | undefined): CommentImage | undefined {
  if (!image) return undefined
  if (!isCommentImageBlobUrl(image.url)) {
    throw new Error('Invalid attachment URL')
  }
  return image
}

/**
 * Magic-link reviewer auth resolution.
 *
 * Delegates to the shared getMagicLinkReviewerFromCookie helper so the
 * upload route can reuse the same trust logic without duplicating it.
 * Returns the `{ token, name, batchId }` shape expected by resolveActor;
 * `batchId` is the batch the reviewer's link is scoped to (enforced below).
 */
async function tryGetMagicLinkReviewer(): Promise<
  null | { token: string; name: string; batchId: string }
> {
  const r = await getMagicLinkReviewerFromCookie()
  return r ? { token: r.tokenHash, name: r.name, batchId: r.batchId } : null
}

// Internal-only: not exported because a 'use server' module can only export
// async functions (Next.js client-import constraint).
class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

/**
 * Action-layer actor, enriched with the caller's TENANT SCOPE (which the
 * service-facing `ThreadActor` deliberately omits): an AM carries their
 * `organizationId`; a magic-link reviewer carries the `batchId` their link is
 * bound to. Every thread action asserts the target post/thread/batch belongs to
 * this scope BEFORE mutating (see `assertScope`), because server actions are
 * directly POST-able and the caller supplies the id.
 */
type ActionActor =
  | { kind: 'am'; userId: string; organizationId: string }
  | { kind: 'reviewer'; reviewerToken: string; reviewerName: string; batchId: string }

/** Strip an ActionActor down to the attribution-only shape the services want. */
function toThreadActor(actor: ActionActor): ThreadActor {
  return actor.kind === 'am'
    ? { kind: 'am', userId: actor.userId }
    : {
        kind: 'reviewer',
        reviewerToken: actor.reviewerToken,
        reviewerName: actor.reviewerName,
      }
}

/**
 * Resolves the action caller into a scoped ActionActor. Clerk session wins; if
 * absent, falls back to the magic-link reviewer cookie. Throws if neither
 * is present.
 */
async function resolveActor(): Promise<ActionActor> {
  const ctx = await getOrgContext()
  if (ctx) {
    return { kind: 'am', userId: ctx.userDbId, organizationId: ctx.organizationDbId }
  }
  const reviewer = await tryGetMagicLinkReviewer()
  if (reviewer) {
    return {
      kind: 'reviewer',
      reviewerToken: reviewer.token,
      reviewerName: reviewer.name,
      batchId: reviewer.batchId,
    }
  }
  throw new UnauthorizedError(
    'Must be Clerk-authenticated or hold a valid magic-link reviewer session',
  )
}

/**
 * AM-only variant. Used by resolve / reopen / bulk-resolve actions where
 * reviewer-side overrides are not allowed in v1 (per design § AM overrides).
 * Returns a scoped AM ActionActor so callers can reuse `assertScope`.
 */
async function resolveAmActor(): Promise<{ userDbId: string; actor: ActionActor }> {
  const ctx = await getOrgContext()
  if (!ctx) {
    throw new UnauthorizedError('AM-only action: Clerk session required')
  }
  return {
    userDbId: ctx.userDbId,
    actor: { kind: 'am', userId: ctx.userDbId, organizationId: ctx.organizationDbId },
  }
}

/**
 * Tenant-scope guard. Cross-tenant (AM in another org) and cross-batch (a
 * magic-link reviewer touching a post outside their link's batch) reads are
 * treated as "not found" so no existence leaks. An unbatched post
 * (`batchId === null`) can never match a reviewer's batch, so reviewers are
 * denied it; an AM is still scoped by the owning client's org.
 */
function assertScope(
  actor: ActionActor,
  target: { batchId: string | null; organizationId: string } | null,
): void {
  if (!target) throw new Error('Not found')
  if (actor.kind === 'am') {
    if (target.organizationId !== actor.organizationId) throw new Error('Not found')
  } else if (!target.batchId || target.batchId !== actor.batchId) {
    throw new Error('Not found')
  }
}

async function loadPostScope(
  postId: string,
): Promise<{ batchId: string | null; organizationId: string } | null> {
  const post = await db.post.findUnique({
    where: { id: postId },
    select: { batchId: true, client: { select: { organizationId: true } } },
  })
  return post ? { batchId: post.batchId, organizationId: post.client.organizationId } : null
}

async function loadThreadScope(
  threadId: string,
): Promise<{ batchId: string | null; organizationId: string } | null> {
  const thread = await db.postThread.findUnique({
    where: { id: threadId },
    select: {
      post: { select: { batchId: true, client: { select: { organizationId: true } } } },
    },
  })
  return thread
    ? { batchId: thread.post.batchId, organizationId: thread.post.client.organizationId }
    : null
}

async function loadBatchScope(
  batchId: string,
): Promise<{ batchId: string | null; organizationId: string } | null> {
  const batch = await db.batch.findUnique({
    where: { id: batchId },
    select: { id: true, client: { select: { organizationId: true } } },
  })
  return batch ? { batchId: batch.id, organizationId: batch.client.organizationId } : null
}

async function loadReviewItemScope(
  reviewItemId: string,
): Promise<{ batchId: string | null; organizationId: string } | null> {
  const item = await db.reviewItem.findUnique({
    where: { id: reviewItemId },
    select: {
      post: { select: { batchId: true, client: { select: { organizationId: true } } } },
    },
  })
  return item
    ? { batchId: item.post.batchId, organizationId: item.post.client.organizationId }
    : null
}

/**
 * Fast lookup that turns a postId into the path we should revalidate.
 * Returns null if the post is unbatched (rare today but possible in the
 * data model). Caller falls back to a layout-wide revalidation in that
 * case so the preview page stays fresh.
 */
async function revalidatePathForPost(postId: string): Promise<void> {
  const { db } = await import('@/db/client')
  const post = await db.post.findUnique({
    where: { id: postId },
    select: { clientId: true, batchId: true },
  })
  if (post?.batchId && post.clientId) {
    revalidatePath(`/clients/${post.clientId}/batches/${post.batchId}/preview`)
    revalidatePath(`/clients/${post.clientId}/batches/${post.batchId}`)
  } else {
    revalidatePath('/', 'layout')
  }
}

async function revalidatePathForThread(threadId: string): Promise<void> {
  const { db } = await import('@/db/client')
  const thread = await db.postThread.findUnique({
    where: { id: threadId },
    select: { postId: true },
  })
  if (thread) await revalidatePathForPost(thread.postId)
  else revalidatePath('/', 'layout')
}

// ---- Server actions ----

export async function createThreadAction(input: {
  postId: string
  pin: PinLocation
  body: string
  image?: CommentImage
}) {
  const image = validateImage(input.image)
  if (!input.body.trim() && !image) throw new Error('Comment requires text or an image')
  const author = await resolveActor()
  assertScope(author, await loadPostScope(input.postId))

  // Resolve internal @-mentions server-side from the body against the client's
  // internal roster (never trust a client-sent id list). Reviewers (no Clerk
  // session) get no roster, so the pin/thread path never @-pings from the
  // client review surface.
  let mentionedUserIds: string[] = []
  if (author.kind === 'am') {
    const post = await db.post.findUnique({
      where: { id: input.postId },
      select: { clientId: true },
    })
    if (post?.clientId) {
      const roster = await internalMentionRosterForClient(post.clientId)
      mentionedUserIds = resolveMentionedUserIds(input.body, roster)
    }
  }

  const result = await createThread({
    postId: input.postId,
    pin: input.pin,
    body: input.body,
    author: toThreadActor(author),
    imageUrl: image?.url ?? null,
    imageWidth: image?.width ?? null,
    imageHeight: image?.height ?? null,
    mentionedUserIds,
  })
  await revalidatePathForPost(input.postId)
  return result
}

export async function addCommentAction(input: {
  threadId: string
  body: string
  image?: CommentImage
}) {
  const image = validateImage(input.image)
  if (!input.body.trim() && !image) throw new Error('Comment requires text or an image')
  const author = await resolveActor()
  assertScope(author, await loadThreadScope(input.threadId))
  const result = await addComment({
    threadId: input.threadId,
    body: input.body,
    author: toThreadActor(author),
    imageUrl: image?.url ?? null,
    imageWidth: image?.width ?? null,
    imageHeight: image?.height ?? null,
  })
  if (author.kind === 'am') {
    // Client-facing email reply (early-returns on a purely internal thread).
    await notifyClientOfAmReply({ threadId: input.threadId, amUserId: author.userId })

    // Internal-review bell notify: ping thread participants + relay holder +
    // any @-mentioned roster members. Mentions are resolved server-side from
    // the body against the internal roster (never trust a client-sent list).
    // The two notifies are independent: an AM reply on a client thread can
    // both email the client and bell internal participants.
    const thread = await db.postThread.findUnique({
      where: { id: input.threadId },
      select: { post: { select: { clientId: true } } },
    })
    const clientId = thread?.post?.clientId
    if (clientId) {
      const roster = await internalMentionRosterForClient(clientId)
      const mentionedUserIds = resolveMentionedUserIds(input.body, roster)
      await notifyInternalThreadReply({
        threadId: input.threadId,
        actorUserId: author.userId,
        mentionedUserIds,
      })
    }
  }
  await revalidatePathForThread(input.threadId)
  return result
}

export async function resolveThreadAction(input: {
  threadId: string
  resolvedReason: string | null
}) {
  const { userDbId, actor } = await resolveAmActor()
  assertScope(actor, await loadThreadScope(input.threadId))
  await resolveThread({
    threadId: input.threadId,
    resolvedBy: userDbId,
    resolvedReason: input.resolvedReason,
  })
  await revalidatePathForThread(input.threadId)
}

export async function reopenThreadAction(input: { threadId: string }) {
  // AM-only per design § Open vs resolved.
  const { actor } = await resolveAmActor()
  assertScope(actor, await loadThreadScope(input.threadId))
  await reopenThread({ threadId: input.threadId })
  await revalidatePathForThread(input.threadId)
}

export async function listThreadsForPostAction(input: {
  postId: string
  includeResolved?: boolean
}) {
  // Listing is read-only; either AM or reviewer can call.
  const actor = await resolveActor()
  assertScope(actor, await loadPostScope(input.postId))
  return listThreadsForPost(input)
}

export async function listThreadsForBatchAction(input: {
  batchId: string
  includeResolved?: boolean
}) {
  const actor = await resolveActor()
  assertScope(actor, await loadBatchScope(input.batchId))
  const map = await listThreadsForBatch(input)
  // Maps don't serialize cleanly across the server-action boundary; flatten
  // to a plain object keyed by postId for the client.
  const obj: Record<string, HydratedThread[]> = {}
  for (const [postId, threads] of map.entries()) {
    obj[postId] = threads
  }
  return obj
}

export async function bulkResolveOnPostAction(input: {
  postId: string
  resolvedReason: string
}) {
  const { userDbId, actor } = await resolveAmActor()
  assertScope(actor, await loadPostScope(input.postId))
  const count = await bulkResolveOnPost({
    postId: input.postId,
    resolvedBy: userDbId,
    resolvedReason: input.resolvedReason,
  })
  await revalidatePathForPost(input.postId)
  return { count }
}

/**
 * AM-only: reply to a post's general (non-pin) client feedback. Promotes the
 * client's Notes into a reviewer-attributed post-level thread (idempotent) and
 * appends the AM reply. See src/server/lib/promotePostFeedback.ts.
 */
export async function replyToPostFeedbackAction(input: {
  reviewItemId: string
  body: string
  image?: CommentImage
}) {
  const image = validateImage(input.image)
  if (!input.body.trim() && !image) throw new Error('Comment requires text or an image')
  const { userDbId, actor } = await resolveAmActor()
  assertScope(actor, await loadReviewItemScope(input.reviewItemId))
  const result = await promotePostFeedbackToThread({
    reviewItemId: input.reviewItemId,
    amUserId: userDbId,
    body: input.body,
    imageUrl: image?.url ?? null,
    imageWidth: image?.width ?? null,
    imageHeight: image?.height ?? null,
  })
  await notifyClientOfAmReply({ threadId: result.threadId, amUserId: userDbId })
  await revalidatePathForThread(result.threadId)
  return result
}

/**
 * AM-only: promote a comment's attached reference image to the post's media
 * (Post.mediaUrls[0], replace semantics).
 *
 * Deliberately does NOT auto-resolve the pin — the AM decides separately
 * whether to mark the thread resolved after acting on the client's feedback.
 *
 * Permission: 'post.media.edit' (AMs and admins; clients cannot call this).
 */
export async function useCommentImageAsPostMediaAction(input: {
  postId: string
  commentId: string
}) {
  const ctx = await requireCan('post.media.edit')

  const comment = await db.postComment.findUnique({
    where: { id: input.commentId },
    select: {
      imageUrl: true,
      thread: {
        select: {
          post: {
            select: {
              id: true,
              clientId: true,
              batchId: true,
              client: { select: { organizationId: true } },
            },
          },
        },
      },
    },
  })

  const post = comment?.thread.post
  if (!comment || !post || post.id !== input.postId) {
    throw new Error('Not found')
  }

  if (post.client.organizationId !== ctx.organizationDbId && !ctx.platformOwner) {
    throw new Error('Not found')
  }

  if (!comment.imageUrl || !isCommentImageBlobUrl(comment.imageUrl)) {
    throw new Error('Comment has no usable image')
  }

  await assertBatchEditable(post.batchId)
  await attachMediaToPost({ postId: input.postId, url: comment.imageUrl })
  await revalidatePathForPost(input.postId)
}
