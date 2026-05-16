import { cookies, headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { verifySession } from '@/lib/magic-link'
import { db } from '@/db/client'
import { listThreadsForBatch } from '@/server/repositories/threads'
import { NameModal } from './name-modal'
import { ReviewFeed } from './review-feed'

const SESSION_COOKIE_NAME = 'magic-link-session'

/**
 * /review/[token] landing.
 *
 * Middleware (src/middleware.ts) has already verified the token signature,
 * expiry, and DB row state. It attaches the magicLinkId + batchId to
 * request headers so this handler can skip a duplicate verify + DB lookup.
 *
 * Render branches:
 *   1. No session cookie OR cookie does not verify under MAGIC_LINK_SECRET
 *      OR cookie's magicLinkId does not match this token's magic link OR
 *      the referenced MagicLinkReviewer row is missing → render the
 *      first-visit NameModal. The reviewer confirms identity, the action
 *      sets the cookie, router.refresh re-enters here, and we fall into
 *      branch 2.
 *   2. Session valid and reviewer recognized → load batch posts + threads
 *      and render the feed in mode='review'.
 */
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const hdrs = await headers()
  const magicLinkId = hdrs.get('x-magic-link-id')
  const batchId = hdrs.get('x-magic-link-batch-id')

  // Defensive: the middleware always sets these on a validated request.
  // If they are missing the route was reached by some path other than the
  // guarded middleware — treat as not found rather than guess.
  if (!magicLinkId || !batchId) {
    notFound()
  }

  const link = await db.magicLink.findUnique({
    where: { id: magicLinkId },
    select: {
      id: true,
      defaultReviewerName: true,
      defaultReviewerEmail: true,
      batch: {
        select: {
          id: true,
          label: true,
          client: { select: { id: true, name: true } },
        },
      },
    },
  })
  if (!link) {
    notFound()
  }

  // Side effect: bump lastVisitedAt so the AM can see "client opened
  // this link" in the batch page. Best-effort; failures here should not
  // block the render.
  void db.magicLink
    .update({ where: { id: link.id }, data: { lastVisitedAt: new Date() } })
    .catch(() => null)

  // -- Identity branch --
  const jar = await cookies()
  const cookieValue = jar.get(SESSION_COOKIE_NAME)?.value
  let recognizedReviewerName: string | null = null

  if (cookieValue) {
    const session = verifySession(cookieValue)
    if (session && session.magicLinkId === link.id) {
      const reviewer = await db.magicLinkReviewer.findUnique({
        where: { id: session.reviewerId },
        select: { id: true, name: true, magicLinkId: true },
      })
      if (reviewer && reviewer.magicLinkId === link.id) {
        recognizedReviewerName = reviewer.name
      }
    }
  }

  if (!recognizedReviewerName) {
    return (
      <NameModal
        token={token}
        defaultName={link.defaultReviewerName}
        defaultEmail={link.defaultReviewerEmail}
      />
    )
  }

  // -- Feed branch --
  const posts = await db.post.findMany({
    where: { batchId: link.batch.id, deletedAt: null },
    orderBy: { postDate: 'asc' },
    select: {
      id: true,
      caption: true,
      hashtags: true,
      mediaUrls: true,
    },
  })

  const threadsByPost = await listThreadsForBatch({ batchId: link.batch.id })

  const feedPosts = posts.map((p) => ({
    post: {
      id: p.id,
      caption: p.caption,
      hashtags: p.hashtags,
      mediaUrl: p.mediaUrls[0] ?? null,
    },
    threads: threadsByPost.get(p.id) ?? [],
  }))

  return (
    <ReviewFeed
      token={token}
      clientName={link.batch.client.name}
      batchLabel={link.batch.label}
      reviewerName={recognizedReviewerName}
      posts={feedPosts}
    />
  )
}
