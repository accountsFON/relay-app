'use server'

import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { hashToken, signSession, verifySession, verifyToken } from '@/lib/magic-link'
import { findByTokenHash, recordReviewer } from '@/server/repositories/magicLinks'
import { addComment, createThread } from '@/server/repositories/threads'
import type { PinLocation } from '@/types/preview'
import { isCommentImageBlobUrl } from '@/lib/comment-image'

type CommentImage = { url: string; width?: number | null; height?: number | null }

function validateImage(image: CommentImage | undefined): CommentImage | undefined {
  if (!image) return undefined
  if (!isCommentImageBlobUrl(image.url)) {
    throw new MagicLinkActionError('Image URL is not a valid blob URL')
  }
  return image
}

/**
 * Cookie name format: scoped per-token via the path attribute, but the
 * cookie *name* itself is shared. Browsers key cookies by (domain, path,
 * name); two reviewers visiting two different /review/[token] URLs each
 * see their own cookie because the Path attribute disambiguates them.
 */
const SESSION_COOKIE_NAME = 'magic-link-session'
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60 // 30 days

/**
 * Local error class: kept un-exported because 'use server' files only
 * permit async function exports. Callers see a generic Error with a
 * meaningful message; the error.name discriminator is preserved for
 * logging / telemetry but is not part of the public API.
 */
class MagicLinkActionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MagicLinkActionError'
  }
}

/**
 * Re-verifies the URL token (do NOT trust the client-supplied token blindly
 * even though the middleware already gated the page render, server actions
 * are independent request entry points). Returns the resolved magic link or
 * throws.
 */
async function resolveLinkOrThrow(token: string) {
  if (!token || typeof token !== 'string') {
    throw new MagicLinkActionError('token required')
  }
  const verified = verifyToken(token)
  if (!verified) {
    throw new MagicLinkActionError('Invalid or expired link')
  }
  const link = await findByTokenHash(hashToken(token))
  if (!link || link.revokedAt || link.batch.deletedAt) {
    throw new MagicLinkActionError('Link no longer available')
  }
  return link
}

/**
 * First-visit name confirm. Creates (or upserts) a MagicLinkReviewer row,
 * signs a session JWT, and sets a path-scoped cookie. The page then
 * re-renders via router.refresh() and the modal disappears because
 * verifySession returns a row on the second render.
 *
 * The sessionId we mint here is the stable identifier across visits. It
 * lives only inside the signed cookie and the MagicLinkReviewer row.
 *
 * Input is declared inline (not as an exported interface) because
 * 'use server' files only permit async function exports.
 */
export async function confirmReviewerIdentity(
  input: { token: string; name: string; email?: string },
): Promise<void> {
  const link = await resolveLinkOrThrow(input.token)

  const name = (input.name ?? '').trim()
  if (!name) {
    throw new MagicLinkActionError('Name is required')
  }
  const email = input.email?.trim() ? input.email.trim() : undefined

  // 32 random bytes = 256 bits of entropy, plenty for uniqueness across
  // every magic link that will ever exist. base64url because it goes
  // straight into the cookie payload alongside the magicLinkId.
  const sessionId = randomBytes(32).toString('base64url')

  const reviewer = await recordReviewer({
    magicLinkId: link.id,
    name,
    email,
    sessionId,
  })

  const cookieValue = signSession({
    magicLinkId: link.id,
    reviewerId: reviewer.id,
  })

  const jar = await cookies()
  jar.set({
    name: SESSION_COOKIE_NAME,
    value: cookieValue,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    // Cookie path is `/` because the v2 surface fires API calls from
    // /api/review/[token]/draft which would not receive a /review/[token]
    // scoped cookie. Multi-reviewer isolation is enforced by the signed
    // JWT (magicLinkId + reviewerId) being verified against the URL token
    // on every request, not by cookie path scoping.
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })

  // Force a re-render of the layout + page so the no-cookie branch
  // re-evaluates and renders the feed instead of the modal.
  revalidatePath(`/review/${input.token}`)
}

/**
 * Wrapper around the thread repository's createThread that fills in the
 * reviewer attribution from the cookie session. We deliberately do NOT
 * route through src/server/actions/threads.ts because that path runs
 * Clerk + magic-link cookie resolution generically and we want a clear,
 * narrow call surface for the magic-link page itself.
 *
 * Validates that:
 *   1. The URL token is still valid + non-revoked.
 *   2. A session cookie exists and verifies under MAGIC_LINK_SECRET.
 *   3. The session's magicLinkId matches the URL token's magic link
 *      (prevents a cookie minted on link A from leaking into link B).
 *   4. The MagicLinkReviewer row referenced by the cookie still exists.
 *
 * Input is inline (not an exported interface) per 'use server' constraints.
 */
export async function leaveCommentAsReviewer(
  input: {
    token: string
    postId: string
    pin: PinLocation
    body: string
    image?: CommentImage
  },
): Promise<void> {
  const link = await resolveLinkOrThrow(input.token)

  const jar = await cookies()
  const cookieValue = jar.get(SESSION_COOKIE_NAME)?.value
  if (!cookieValue) {
    throw new MagicLinkActionError('No reviewer session; confirm your name first')
  }

  const session = verifySession(cookieValue)
  if (!session) {
    throw new MagicLinkActionError('Reviewer session expired; refresh the page')
  }
  if (session.magicLinkId !== link.id) {
    throw new MagicLinkActionError('Reviewer session does not match this link')
  }

  // The JWT payload's reviewerId is the MagicLinkReviewer.id (set by
  // confirmReviewerIdentity below). We look up directly by row id via
  // the prisma client; the repository's findReviewerBySession helper
  // keys on sessionId, which we do not store in the JWT.
  const { db } = await import('@/db/client')
  const reviewerRow = await db.magicLinkReviewer.findUnique({
    where: { id: session.reviewerId },
  })
  if (!reviewerRow || reviewerRow.magicLinkId !== link.id) {
    throw new MagicLinkActionError('Reviewer no longer recognized for this link')
  }

  const image = validateImage(input.image)
  const body = (input.body ?? '').trim()
  if (!body && !image) {
    throw new MagicLinkActionError('Comment requires text or an image')
  }

  await createThread({
    postId: input.postId,
    pin: input.pin,
    body,
    imageUrl: image?.url ?? null,
    imageWidth: image?.width ?? null,
    imageHeight: image?.height ?? null,
    author: {
      kind: 'reviewer',
      // We persist the token *hash* as the reviewer token on the thread
      // row so that revoking the link transparently invalidates the
      // attribution surface (the raw token never lives in the DB).
      reviewerToken: hashToken(input.token),
      reviewerName: reviewerRow.name,
    },
  })

  revalidatePath(`/review/${input.token}`)
}

/**
 * Append a comment to an existing thread on behalf of a magic-link reviewer.
 * Same auth shape as leaveCommentAsReviewer: re-verifies the token, the
 * session cookie, and the cookie's bind to this link. Differs only in that
 * the thread already exists, so we route to the repo's addComment instead
 * of createThread.
 *
 * Input is inline (not an exported interface) per 'use server' constraints.
 */
export async function addCommentAsReviewer(
  input: {
    token: string
    threadId: string
    body: string
    image?: CommentImage
  },
): Promise<void> {
  const link = await resolveLinkOrThrow(input.token)

  const jar = await cookies()
  const cookieValue = jar.get(SESSION_COOKIE_NAME)?.value
  if (!cookieValue) {
    throw new MagicLinkActionError('No reviewer session; confirm your name first')
  }

  const session = verifySession(cookieValue)
  if (!session) {
    throw new MagicLinkActionError('Reviewer session expired; refresh the page')
  }
  if (session.magicLinkId !== link.id) {
    throw new MagicLinkActionError('Reviewer session does not match this link')
  }

  const { db } = await import('@/db/client')
  const reviewerRow = await db.magicLinkReviewer.findUnique({
    where: { id: session.reviewerId },
  })
  if (!reviewerRow || reviewerRow.magicLinkId !== link.id) {
    throw new MagicLinkActionError('Reviewer no longer recognized for this link')
  }

  const image = validateImage(input.image)
  const body = (input.body ?? '').trim()
  if (!body && !image) {
    throw new MagicLinkActionError('Comment requires text or an image')
  }

  await addComment({
    threadId: input.threadId,
    body,
    imageUrl: image?.url ?? null,
    imageWidth: image?.width ?? null,
    imageHeight: image?.height ?? null,
    author: {
      kind: 'reviewer',
      reviewerToken: hashToken(input.token),
      reviewerName: reviewerRow.name,
    },
  })

  revalidatePath(`/review/${input.token}`)
}
