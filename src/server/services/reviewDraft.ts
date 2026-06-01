/**
 * Draft persistence service for the v2 client review surface.
 *
 * Every decision tap, comment edit, and caption suggestion on the review
 * surface PATCHes to /api/review/[token]/draft. This service is the single
 * choke point that:
 *
 *   1. Verifies the magic-link reviewer's signed `magic-link-session`
 *      cookie (HMAC + expiry).
 *   2. Resolves the URL token to a live, non-revoked MagicLink + Batch.
 *   3. Confirms the cookie's magicLinkId matches the URL token's
 *      magicLinkId (a cookie minted for link A must never bind a
 *      reviewer to link B).
 *   4. Loads or creates the reviewer's active ReviewSession for this
 *      link (round = highest in_progress; starts a fresh round 1
 *      session if none exists yet).
 *   5. Asserts the postId being drafted belongs to the magic link's
 *      batch (defense in depth: the client never owns postId selection
 *      authority).
 *   6. Hands off to the Task 1.4 repository's `saveDraftItem` which
 *      performs the upsert on (reviewSessionId, postId).
 *
 * Errors are thrown as named classes so the route handler can map them
 * to HTTP status codes without parsing message strings.
 *
 * NOTE on Task 1.4 dependency: this service imports `findActiveSession`,
 * `startSession`, and `saveDraftItem` from `@/server/repositories/reviewSessions`.
 * Layer 1.4 is in flight in parallel; the import resolves once both PRs
 * are squash-merged into main. The repo shape is locked in the plan doc
 * (Task 1.4 success criteria) so we code against it directly. Tests
 * mock the repo so they run independently of 1.4's merge order.
 */
import { cookies } from 'next/headers'
import { db } from '@/db/client'
import { hashToken, verifySession, verifyToken } from '@/lib/magic-link'
import { findByTokenHash, findReviewerBySession } from '@/server/repositories/magicLinks'
import {
  findActiveSession,
  saveDraftItem,
  startSession,
} from '@/server/repositories/reviewSessions'
import type { ReviewDecisionType, ReviewItemHydrated } from '@/types/review-session'

const SESSION_COOKIE_NAME = 'magic-link-session'

export class ReviewDraftUnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'ReviewDraftUnauthorizedError'
  }
}

export class ReviewDraftLinkGoneError extends Error {
  constructor(message = 'Magic link no longer available') {
    super(message)
    this.name = 'ReviewDraftLinkGoneError'
  }
}

export class ReviewDraftPostNotInBatchError extends Error {
  constructor(message = 'Post does not belong to this magic link batch') {
    super(message)
    this.name = 'ReviewDraftPostNotInBatchError'
  }
}

export class ReviewDraftInvalidInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReviewDraftInvalidInputError'
  }
}

export interface SaveItemDraftInput {
  /** Raw URL token from /review/[token]/draft. */
  token: string
  /** Post id the client is drafting against. Must belong to the link's batch. */
  postId: string
  /** New decision state. Optional, omitted means "leave decision alone, only update comment / caption". */
  decision?: ReviewDecisionType
  /** Free-text comment. `null` clears, `undefined` leaves unchanged. */
  comment?: string | null
  /** Suggested replacement caption. `null` clears, `undefined` leaves unchanged. */
  suggestedCaption?: string | null
}

/**
 * Saves (or creates) a draft ReviewItem for a magic-link reviewer's
 * currently active ReviewSession. Returns the hydrated ReviewItem the
 * client should treat as the source of truth.
 */
export async function saveItemDraft(
  input: SaveItemDraftInput,
): Promise<ReviewItemHydrated> {
  if (!input.token || typeof input.token !== 'string') {
    throw new ReviewDraftInvalidInputError('token is required')
  }
  if (!input.postId || typeof input.postId !== 'string') {
    throw new ReviewDraftInvalidInputError('postId is required')
  }

  // 1. Validate the URL token signature + expiry before any DB work.
  //    Middleware already did this on the page render, but the API route
  //    is an independent request entry point so we re-verify here.
  const verified = verifyToken(input.token)
  if (!verified) {
    throw new ReviewDraftUnauthorizedError('Invalid or expired magic link token')
  }

  // 2. Resolve the magic link by token hash. Catches revocation +
  //    batch-archival without leaking which state caused the rejection.
  const link = await findByTokenHash(hashToken(input.token))
  if (!link || link.revokedAt || link.batch.deletedAt) {
    throw new ReviewDraftLinkGoneError()
  }
  if (link.id !== verified.magicLinkId) {
    // The token's HMAC payload disagrees with the DB row's id. This
    // should be impossible (token is signed against the row id at mint
    // time) but treat as an auth failure rather than crashing.
    throw new ReviewDraftUnauthorizedError('Token / link mismatch')
  }

  // 3. Verify the signed cookie session and bind it to this link.
  const jar = await cookies()
  const cookieValue = jar.get(SESSION_COOKIE_NAME)?.value
  if (!cookieValue) {
    throw new ReviewDraftUnauthorizedError('No reviewer session cookie')
  }
  const session = verifySession(cookieValue)
  if (!session) {
    throw new ReviewDraftUnauthorizedError('Reviewer session expired or invalid')
  }
  if (session.magicLinkId !== link.id) {
    throw new ReviewDraftUnauthorizedError(
      'Reviewer session does not match this magic link',
    )
  }

  // 4. Resolve the MagicLinkReviewer row. The cookie carries reviewerId
  //    directly; findReviewerBySession keys on sessionId which we do not
  //    have in the JWT, so we look up by id.
  const reviewer = await db.magicLinkReviewer.findUnique({
    where: { id: session.reviewerId },
  })
  if (!reviewer || reviewer.magicLinkId !== link.id) {
    throw new ReviewDraftUnauthorizedError('Reviewer not recognized for this link')
  }

  // 5. Defense in depth: confirm the postId belongs to the magic link's
  //    batch before letting the repo upsert. A reviewer with one batch's
  //    link must not be able to draft on a different batch's posts.
  const post = await db.post.findUnique({
    where: { id: input.postId },
    select: { id: true, batchId: true },
  })
  if (!post || post.batchId !== link.batchId) {
    throw new ReviewDraftPostNotInBatchError()
  }

  // 6. Find or create the active ReviewSession. Layer 1.4's contract:
  //    findActiveSession returns the latest in_progress session for
  //    (magicLinkId, reviewerId) or null; startSession creates a fresh
  //    round 1 session.
  let activeSession = await findActiveSession({
    magicLinkId: link.id,
    reviewerId: reviewer.id,
  })
  if (!activeSession) {
    activeSession = await startSession({
      magicLinkId: link.id,
      reviewerId: reviewer.id,
    })
  }

  // 7. Upsert the draft item. Repo handles the create-vs-update branch
  //    based on the @@unique([reviewSessionId, postId]) constraint.
  //
  // PATCH semantics: forward each field as-is so undefined means "leave
  // this column alone" all the way to Prisma. The repo's create branch
  // supplies a 'not_reviewed' default for the decision column on first
  // insert so the row is always valid; the update branch lets Prisma
  // skip any column whose input is undefined.
  const item = await saveDraftItem({
    reviewSessionId: activeSession.id,
    postId: input.postId,
    decision: input.decision,
    comment: input.comment,
    suggestedCaption: input.suggestedCaption,
  })

  return item
}
