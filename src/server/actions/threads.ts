'use server'

import { revalidatePath } from 'next/cache'
import { getOrgContext } from '@/server/middleware/auth'
import { getMagicLinkReviewerFromCookie } from '@/server/auth/magic-link-reviewer'
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
 * Returns the `{ token, name }` shape expected by resolveActor.
 */
async function tryGetMagicLinkReviewer(): Promise<
  null | { token: string; name: string }
> {
  const r = await getMagicLinkReviewerFromCookie()
  return r ? { token: r.tokenHash, name: r.name } : null
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
 * Resolves the action caller into a ThreadActor. Clerk session wins; if
 * absent, falls back to the magic-link reviewer cookie. Throws if neither
 * is present.
 */
async function resolveActor(): Promise<ThreadActor> {
  const ctx = await getOrgContext()
  if (ctx) {
    return { kind: 'am', userId: ctx.userDbId }
  }
  const reviewer = await tryGetMagicLinkReviewer()
  if (reviewer) {
    return {
      kind: 'reviewer',
      reviewerToken: reviewer.token,
      reviewerName: reviewer.name,
    }
  }
  throw new UnauthorizedError(
    'Must be Clerk-authenticated or hold a valid magic-link reviewer session',
  )
}

/**
 * AM-only variant. Used by resolve / reopen / bulk-resolve actions where
 * reviewer-side overrides are not allowed in v1 (per design § AM overrides).
 */
async function resolveAmActor(): Promise<{ userDbId: string }> {
  const ctx = await getOrgContext()
  if (!ctx) {
    throw new UnauthorizedError('AM-only action: Clerk session required')
  }
  return { userDbId: ctx.userDbId }
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
  const result = await createThread({
    postId: input.postId,
    pin: input.pin,
    body: input.body,
    author,
    imageUrl: image?.url ?? null,
    imageWidth: image?.width ?? null,
    imageHeight: image?.height ?? null,
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
  const result = await addComment({
    threadId: input.threadId,
    body: input.body,
    author,
    imageUrl: image?.url ?? null,
    imageWidth: image?.width ?? null,
    imageHeight: image?.height ?? null,
  })
  await revalidatePathForThread(input.threadId)
  return result
}

export async function resolveThreadAction(input: {
  threadId: string
  resolvedReason: string | null
}) {
  const { userDbId } = await resolveAmActor()
  await resolveThread({
    threadId: input.threadId,
    resolvedBy: userDbId,
    resolvedReason: input.resolvedReason,
  })
  await revalidatePathForThread(input.threadId)
}

export async function reopenThreadAction(input: { threadId: string }) {
  // AM-only per design § Open vs resolved.
  await resolveAmActor()
  await reopenThread({ threadId: input.threadId })
  await revalidatePathForThread(input.threadId)
}

export async function listThreadsForPostAction(input: {
  postId: string
  includeResolved?: boolean
}) {
  // Listing is read-only; either AM or reviewer can call.
  await resolveActor()
  return listThreadsForPost(input)
}

export async function listThreadsForBatchAction(input: {
  batchId: string
  includeResolved?: boolean
}) {
  await resolveActor()
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
  const { userDbId } = await resolveAmActor()
  const count = await bulkResolveOnPost({
    postId: input.postId,
    resolvedBy: userDbId,
    resolvedReason: input.resolvedReason,
  })
  await revalidatePathForPost(input.postId)
  return { count }
}
