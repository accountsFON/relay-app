import { cookies } from 'next/headers'
import { db } from '@/db/client'
import { verifySession } from '@/lib/magic-link'

export const MAGIC_LINK_SESSION_COOKIE = 'magic-link-session'

export interface MagicLinkReviewerContext {
  reviewerId: string
  name: string
  magicLinkId: string
  /** The batch this reviewer's link is scoped to. Thread actions enforce that
   *  any post/thread the reviewer touches belongs to THIS batch. */
  batchId: string
  tokenHash: string
}

/**
 * Resolve the signed magic-link reviewer cookie into a reviewer context, or
 * null. Same trust as the thread comment write path.
 *
 * Reads the signed `magic-link-session` cookie, verifies the HMAC, looks up
 * the MagicLinkReviewer row, and guards against mismatched magicLinkId and
 * revoked links before returning the resolved context.
 */
export async function getMagicLinkReviewerFromCookie(): Promise<MagicLinkReviewerContext | null> {
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
      magicLink: {
        select: { id: true, tokenHash: true, revokedAt: true, batchId: true },
      },
    },
  })
  if (!reviewer) return null
  if (reviewer.magicLinkId !== session.magicLinkId) return null
  if (reviewer.magicLink.revokedAt) return null

  return {
    reviewerId: reviewer.id,
    name: reviewer.name,
    magicLinkId: reviewer.magicLinkId,
    batchId: reviewer.magicLink.batchId,
    tokenHash: reviewer.magicLink.tokenHash,
  }
}
