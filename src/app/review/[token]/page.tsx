import { cookies, headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { verifySession, hashToken } from '@/lib/magic-link'
import { db } from '@/db/client'
import { markMagicLinkVisited } from '@/server/services/magic-link-visited-emit'
import {
  findActiveClientSessionForLink,
  listSessionsForBatch,
} from '@/server/repositories/reviewSessions'
import { listThreadsForBatch } from '@/server/repositories/threads'
import { postHasNewAmReply } from './new-reply'
import type {
  ReviewItemHydrated,
  ReviewSessionStatusType,
  ReviewSessionSummary,
} from '@/types/review-session'
import { NameModal } from './name-modal'
import { ReviewSessionShell } from './review-session-shell'

const SESSION_COOKIE_NAME = 'magic-link-session'

/**
 * /review/[token] landing (v2 client review surface).
 *
 * Middleware (src/middleware.ts) has already verified the token signature,
 * expiry, and DB row state. It attaches the magicLinkId + batchId to
 * request headers so this handler can skip a duplicate verify + DB lookup.
 *
 * Render branches:
 *   1. No session cookie OR cookie does not verify OR cookie's magicLinkId
 *      does not match this token's magic link OR the referenced
 *      MagicLinkReviewer row is missing -> render the first-visit NameModal.
 *   2. Session valid and reviewer recognized -> load posts + review session
 *      state and render <ReviewSessionShell>.
 *
 * The v2 surface replaces the v1 thread-feed entirely. PostThread infra is
 * still wired for the AM-internal preview page; this page no longer renders
 * threads or per-pin markup affordances on the client surface.
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

  // Defensive: middleware always sets these on a validated request. If
  // missing, the route was reached by some path other than the guard.
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
          client: {
            select: {
              id: true,
              name: true,
              assignedAm: { select: { id: true, name: true } },
            },
          },
          label: true,
        },
      },
      creator: { select: { id: true, name: true } },
    },
  })
  if (!link) {
    notFound()
  }

  // Atomic first-visit detection + AM mention. Bumps lastVisitedAt on
  // every visit so the AM's "Last visited X" indicator stays accurate;
  // only emits the magic_link_visited ActivityEvent on the very first
  // visit. Race-safe via a CAS-style updateMany. Fire-and-forget so a
  // mention-write failure can't block the reviewer's page render.
  void markMagicLinkVisited({
    magicLinkId: link.id,
    batchId: link.batch.id,
    clientId: link.batch.client.id,
    assignedAmUserId: link.batch.client.assignedAm?.id ?? null,
    defaultReviewerName: link.defaultReviewerName,
  }).catch(() => null)

  // -- Identity branch --
  const jar = await cookies()
  const cookieValue = jar.get(SESSION_COOKIE_NAME)?.value
  let recognizedReviewerId: string | null = null
  let recognizedReviewerName: string | null = null
  // The reviewer's last-seen-replies timestamp captured BEFORE we mark it to
  // now below. Badges are computed against this pre-update value so they show
  // this visit and clear on the next. Null = never seen (badge any AM reply).
  let repliesSeenAt: Date | null = null

  if (cookieValue) {
    const session = verifySession(cookieValue)
    if (session && session.magicLinkId === link.id) {
      const reviewer = await db.magicLinkReviewer.findUnique({
        where: { id: session.reviewerId },
        select: {
          id: true,
          name: true,
          magicLinkId: true,
          repliesSeenAt: true,
        },
      })
      if (reviewer && reviewer.magicLinkId === link.id) {
        recognizedReviewerId = reviewer.id
        recognizedReviewerName = reviewer.name
        repliesSeenAt = reviewer.repliesSeenAt ?? null
      }
    }
  }

  if (!recognizedReviewerId || !recognizedReviewerName) {
    return (
      <NameModal
        token={token}
        defaultName={link.defaultReviewerName}
        defaultEmail={link.defaultReviewerEmail}
      />
    )
  }

  // -- Session resolution --
  // Prefer the most-recent in_progress session for this reviewer. If none,
  // fall back to the most-recent submitted/superseded session on this batch
  // for this reviewer (so a returning client who has already submitted
  // sees the thanks screen instead of an empty fresh feed). We DON'T start
  // a fresh session here -- the reviewer-side `saveReviewDraftAction` will
  // lazily create one the first time they tap a decision.
  // Resolve by the link, not the reviewer: a re-confirm mints a new
  // reviewerId, and we must reuse the link's one in-progress session.
  const activeSession = await findActiveClientSessionForLink(link.id)

  let sessionStatus: ReviewSessionStatusType | null = null
  let initialItems: ReviewItemHydrated[] = []
  let submittedSummary: ReviewSessionSummary | null = null

  if (activeSession) {
    sessionStatus = activeSession.status as ReviewSessionStatusType
    const items = await db.reviewItem.findMany({
      where: { reviewSessionId: activeSession.id },
    })
    initialItems = items.map((it) => ({
      id: it.id,
      postId: it.postId,
      decision: it.decision as ReviewItemHydrated['decision'],
      comment: it.comment,
      suggestedCaption: it.suggestedCaption,
      acceptedAsPostVersionId: it.acceptedAsPostVersionId,
      updatedSinceLastReview: it.updatedSinceLastReview,
      lastReviewedVersionId: it.lastReviewedVersionId,
      reviewedAt: it.reviewedAt,
      addressedAt: it.addressedAt,
      noteResolvedAt: it.noteResolvedAt,
    }))
  } else {
    // No active session: check for a prior submitted one to render the
    // thanks screen for returning clients.
    const allSessions = await listSessionsForBatch(link.batch.id)
    // listSessionsForBatch is ordered submittedAt desc, so the first
    // submitted client session is the most recent. Match by link, not
    // reviewerId, so a re-confirmed returning client still sees the thanks
    // screen instead of an empty fresh feed.
    const mineSubmitted = allSessions.find(
      (s) => s.kind === 'client' && s.status === 'submitted',
    )
    if (mineSubmitted) {
      sessionStatus = 'submitted'
      submittedSummary =
        (mineSubmitted.submittedSummary as unknown as ReviewSessionSummary | null) ??
        null
      initialItems = mineSubmitted.items.map((it) => ({
        id: it.id,
        postId: it.postId,
        decision: it.decision as ReviewItemHydrated['decision'],
        comment: it.comment,
        suggestedCaption: it.suggestedCaption,
        acceptedAsPostVersionId: it.acceptedAsPostVersionId,
        updatedSinceLastReview: it.updatedSinceLastReview,
        lastReviewedVersionId: it.lastReviewedVersionId,
        reviewedAt: it.reviewedAt,
        addressedAt: it.addressedAt,
        noteResolvedAt: it.noteResolvedAt,
      }))
    }
  }

  // -- Feed data --
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

  // Phase 4 item 22: hydrate threads per post so the v2 client surface renders
  // existing image/caption pins as numbered badges. Threads created by reviewers
  // on prior visits (same magic link, same or other reviewer) round-trip onto the
  // page. P2 #26: include RESOLVED threads too so a resolved pin stays visible
  // (greyed / struck) instead of vanishing; counts that gate submit routing scope
  // to open client pins in the shell.
  const threadsByPostId = await listThreadsForBatch({
    batchId: link.batch.id,
    includeResolved: true,
  })

  const feedPosts = posts.map((p) => {
    const postThreads = threadsByPostId.get(p.id) ?? []
    return {
      post: {
        id: p.id,
        caption: p.caption,
        hashtags: p.hashtags,
        mediaUrl: p.mediaUrls[0] ?? null,
      },
      threads: postThreads,
      hasNewReply: postHasNewAmReply(postThreads, repliesSeenAt),
    }
  })

  // Badges were computed from the pre-update `repliesSeenAt` above, so marking
  // it to now is safe: this visit still shows the badges, the next visit clears
  // them. Fire-and-forget — a write failure must never block the page render.
  void db.magicLinkReviewer
    .update({
      where: { id: recognizedReviewerId },
      data: { repliesSeenAt: new Date() },
    })
    .catch(() => null)

  // AM name for the thanks screen + reply-by-email hint. Prefer the
  // assigned AM on the client; fall back to whoever created the link.
  const amName =
    link.batch.client.assignedAm?.name ?? link.creator?.name ?? 'Your team'

  return (
    <ReviewSessionShell
      token={token}
      tokenHash={hashToken(token)}
      clientName={link.batch.client.name}
      batchLabel={link.batch.label}
      reviewerName={recognizedReviewerName}
      amName={amName}
      posts={feedPosts}
      initialItems={initialItems}
      sessionStatus={sessionStatus}
      submittedSummary={submittedSummary}
    />
  )
}
