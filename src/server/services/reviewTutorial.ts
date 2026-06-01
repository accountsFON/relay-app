/**
 * Service: mark the magic-link reviewer's tutorial as seen.
 *
 * Fires from POST /api/review/[token]/tutorial-seen when the reviewer
 * dismisses the first visit tutorial modal (any of: Got it on step 1,
 * Got it on step 2, top right X). Sets MagicLinkReviewer.tutorialSeenAt
 * to now() so subsequent visits skip the modal.
 *
 * Re-uses the same auth pattern as reviewDraft: verify URL token, look
 * up the link by token hash, verify the signed cookie session binds to
 * this link, then update by reviewer id.
 *
 * Idempotent: a second POST after the column is already set is a no-op
 * (we still issue the update so the timestamp reflects the most recent
 * dismissal but the modal stays gone either way).
 */
import { cookies } from 'next/headers'
import { db } from '@/db/client'
import { hashToken, verifySession, verifyToken } from '@/lib/magic-link'
import { findByTokenHash } from '@/server/repositories/magicLinks'

const SESSION_COOKIE_NAME = 'magic-link-session'

export class ReviewTutorialUnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'ReviewTutorialUnauthorizedError'
  }
}

export class ReviewTutorialLinkGoneError extends Error {
  constructor(message = 'Magic link no longer available') {
    super(message)
    this.name = 'ReviewTutorialLinkGoneError'
  }
}

export interface MarkTutorialSeenInput {
  /** Raw URL token from /review/[token]. */
  token: string
}

export interface MarkTutorialSeenResult {
  reviewerId: string
  tutorialSeenAt: Date
}

export async function markTutorialSeen(
  input: MarkTutorialSeenInput,
): Promise<MarkTutorialSeenResult> {
  const verified = verifyToken(input.token)
  if (!verified) {
    throw new ReviewTutorialUnauthorizedError('Invalid or expired magic link token')
  }

  const link = await findByTokenHash(hashToken(input.token))
  if (!link || link.revokedAt || link.batch.deletedAt) {
    throw new ReviewTutorialLinkGoneError()
  }
  if (link.id !== verified.magicLinkId) {
    throw new ReviewTutorialUnauthorizedError('Token / link mismatch')
  }

  const jar = await cookies()
  const cookieValue = jar.get(SESSION_COOKIE_NAME)?.value
  if (!cookieValue) {
    throw new ReviewTutorialUnauthorizedError('No reviewer session cookie')
  }
  const session = verifySession(cookieValue)
  if (!session) {
    throw new ReviewTutorialUnauthorizedError('Reviewer session expired or invalid')
  }
  if (session.magicLinkId !== link.id) {
    throw new ReviewTutorialUnauthorizedError(
      'Reviewer session does not match this magic link',
    )
  }

  const reviewer = await db.magicLinkReviewer.findUnique({
    where: { id: session.reviewerId },
    select: { id: true, magicLinkId: true },
  })
  if (!reviewer || reviewer.magicLinkId !== link.id) {
    throw new ReviewTutorialUnauthorizedError('Reviewer not recognized for this link')
  }

  const now = new Date()
  await db.magicLinkReviewer.update({
    where: { id: reviewer.id },
    data: { tutorialSeenAt: now },
  })

  return { reviewerId: reviewer.id, tutorialSeenAt: now }
}
