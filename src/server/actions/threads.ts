'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getOrgContext } from '@/server/middleware/auth'
import { verifySession } from '@/lib/magic-link'
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

const MAGIC_LINK_SESSION_COOKIE = 'magic-link-session'

/**
 * Magic-link reviewer auth resolution.
 *
 * Reads the signed `magic-link-session` cookie set by the magic-link
 * landing page (src/app/review/[token]/_actions.ts → confirmReviewerIdentity).
 * Verifies the HMAC, then looks up the MagicLinkReviewer row whose id
 * is baked into the JWT payload. Returns null if any step fails —
 * callers fall back to Clerk auth or throw UnauthorizedError.
 *
 * The `token` field returned here is the hash of the URL token used as
 * the reviewerToken column value on thread + comment rows. We hash it
 * here from the MagicLink.tokenHash directly rather than re-deriving
 * from the raw URL token — the raw token is not available to a server
 * action invoked from anywhere other than the /review/[token] page,
 * and the hash is the canonical identifier for the link.
 */
async function tryGetMagicLinkReviewer(): Promise<
  null | { token: string; name: string }
> {
  const jar = await cookies()
  const cookieValue = jar.get(MAGIC_LINK_SESSION_COOKIE)?.value
  if (!cookieValue) return null

  const session = verifySession(cookieValue)
  if (!session) return null

  const reviewer = await db.magicLinkReviewer.findUnique({
    where: { id: session.reviewerId },
    select: {
      id: true,
      name: true,
      magicLinkId: true,
      magicLink: { select: { id: true, tokenHash: true, revokedAt: true } },
    },
  })
  if (!reviewer) return null
  if (reviewer.magicLinkId !== session.magicLinkId) return null
  if (reviewer.magicLink.revokedAt) return null

  return { token: reviewer.magicLink.tokenHash, name: reviewer.name }
}

export class UnauthorizedError extends Error {
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
}) {
  const author = await resolveActor()
  const result = await createThread({
    postId: input.postId,
    pin: input.pin,
    body: input.body,
    author,
  })
  await revalidatePathForPost(input.postId)
  return result
}

export async function addCommentAction(input: { threadId: string; body: string }) {
  const author = await resolveActor()
  const result = await addComment({
    threadId: input.threadId,
    body: input.body,
    author,
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
