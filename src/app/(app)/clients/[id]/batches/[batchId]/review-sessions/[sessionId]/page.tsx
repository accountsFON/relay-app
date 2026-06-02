/**
 * AM-side review session detail page.
 *
 * Renders one submitted ReviewSession with per-item context for the AM:
 *   - reviewer identity, round, submitted timestamp, summary chips
 *   - one row per non-approved ReviewItem (changes_requested or
 *     caption_edited). Approved items are intentionally omitted per design;
 *     they sit on the parent batch page.
 *   - StartNextRoundButton once every pending item has been addressed
 *
 * Access control mirrors the existing batch page: requireClientViewer +
 * findClientForUser. The session must also belong to a magic link on a batch
 * the AM has access to, we verify that by walking magicLink → batch → client
 * and notFound() if it doesn't match the scoped client.
 *
 * Layer 2 / Task 2.2.
 */

import Link from 'next/link'
import { requireClientViewer } from '@/server/middleware/permissions'
import { redirectAccessDenied } from '@/server/auth/access'
import { findClientForUser } from '@/server/repositories/clients'
import { findBatch } from '@/server/repositories/batches'
import { findSessionWithItems } from '@/server/repositories/reviewSessions'
import { db } from '@/db/client'
import { PageSection } from '@/components/ui/page-section'
import { EmptyState } from '@/components/ui/empty-state'
import { ReviewSessionHeader } from '@/components/review/review-session-header'
import {
  ReviewItemRow,
  type HydratedItemWithPost,
} from '@/components/review/review-item-row'
import { StartNextRoundButton } from '@/components/review/start-next-round-button'
import {
  acceptCaptionEditAction,
  rejectCaptionEditAction,
  addressItemAction,
  startNextRoundAction,
} from '@/server/actions/reviewSessions'
import type { ReviewSessionSummary } from '@/types/review-session'

export default async function ReviewSessionDetailPage({
  params,
}: {
  params: Promise<{ id: string; batchId: string; sessionId: string }>
}) {
  const ctx = await requireClientViewer()
  const { id, batchId, sessionId } = await params

  // Scope: client must be visible to the user, batch must belong to that
  // client, session must belong to a magic link on that batch.
  const client = await findClientForUser(ctx, id)
  if (!client) redirectAccessDenied()

  const batch = await findBatch(batchId)
  if (!batch || batch.clientId !== client.id) redirectAccessDenied()

  const session = await findSessionWithItems({ reviewSessionId: sessionId })
  if (!session) redirectAccessDenied()

  // Verify the session's magic link is on this batch (existence-leak safe).
  const magicLink = await db.magicLink.findUnique({
    where: { id: session.magicLinkId },
    select: {
      id: true,
      batchId: true,
      defaultReviewerName: true,
      defaultReviewerEmail: true,
    },
  })
  if (!magicLink || magicLink.batchId !== batch.id) redirectAccessDenied()

  // Pull the reviewer row separately (session.reviewerId may be null on
  // sessions started before name-confirm completed; that path is rare for
  // submitted sessions, but handle it gracefully).
  const reviewer = session.reviewerId
    ? await db.magicLinkReviewer.findUnique({
        where: { id: session.reviewerId },
        select: { id: true, name: true, email: true },
      })
    : null

  const reviewerName = reviewer?.name ?? magicLink.defaultReviewerName
  const reviewerEmail = reviewer?.email ?? magicLink.defaultReviewerEmail ?? null

  // Build the 1-indexed post-number map by loading every post in the batch
  // (only ids + dates needed). Mirrors the ordering on the batch page.
  const batchPosts = await db.post.findMany({
    where: { batchId: batch.id },
    orderBy: { postDate: 'asc' },
    select: {
      id: true,
      postDate: true,
      caption: true,
      mediaUrls: true,
    },
  })
  const postNumberById = new Map<string, number>()
  const postById = new Map<string, (typeof batchPosts)[number]>()
  batchPosts.forEach((p, idx) => {
    postNumberById.set(p.id, idx + 1)
    postById.set(p.id, p)
  })

  // Hydrate the non-approved items with their Post data. We omit approved
  // items per spec (those live on the batch page and don't need per-row
  // attention).
  const hydratedItems: HydratedItemWithPost[] = session.items
    .filter((item) => item.decision !== 'approved' && item.decision !== 'not_reviewed')
    .map((item) => {
      const post = postById.get(item.postId)
      if (!post) return null
      return {
        ...item,
        post: {
          id: post.id,
          postDate: post.postDate,
          caption: post.caption,
          mediaUrls: post.mediaUrls,
        },
      }
    })
    .filter((x): x is HydratedItemWithPost => x !== null)

  // Pending vs addressed:
  //   - acceptedAsPostVersionId is set by acceptCaptionEditAction when the
  //     AM accepts a caption suggestion (creates a new PostVersion).
  //   - addressItemAction (Mark Addressed) and rejectCaptionEditAction
  //     (Reject Edit) emit a `review_item_addressed` ActivityEvent with
  //     reviewItemId in the payload. Their server-side state change is
  //     purely the audit-event write, so the page reads the event stream
  //     to know which items have been handled.
  //
  // An item is addressed if EITHER signal is present.
  const itemIds = hydratedItems.map((item) => item.id)
  const addressEvents =
    itemIds.length === 0
      ? []
      : await db.activityEvent.findMany({
          where: {
            clientId: client.id,
            kind: 'review_item_addressed',
          },
          select: { payload: true },
        })
  const itemIdSet = new Set(itemIds)
  const addressedItemIds = new Set<string>()
  for (const e of addressEvents) {
    const reviewItemId = (e.payload as { reviewItemId?: string } | null)
      ?.reviewItemId
    if (reviewItemId && itemIdSet.has(reviewItemId)) {
      addressedItemIds.add(reviewItemId)
    }
  }

  const isAddressed = (item: HydratedItemWithPost) =>
    Boolean(item.acceptedAsPostVersionId) || addressedItemIds.has(item.id)

  const pending = hydratedItems.filter((item) => !isAddressed(item))
  const addressed = hydratedItems.filter((item) => isAddressed(item))

  const summary: ReviewSessionSummary =
    session.submittedSummary ?? {
      approved: session.items.filter((i) => i.decision === 'approved').length,
      changesRequested: session.items.filter((i) => i.decision === 'changes_requested').length,
      captionEdited: session.items.filter((i) => i.decision === 'caption_edited').length,
      totalPosts: session.items.length,
    }

  // Submitted timestamp falls back to startedAt for in_progress / draft state
  // (rare on this surface but safe).
  const submittedAt = session.submittedAt ?? session.startedAt

  const allAddressed = pending.length === 0 && hydratedItems.length > 0
  const isSuperseded = session.status === 'superseded'

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-5xl">
      <ReviewSessionHeader
        reviewerName={reviewerName}
        reviewerEmail={reviewerEmail}
        round={session.round}
        submittedAt={submittedAt}
        summary={summary}
        backHref={`/clients/${client.id}/batches/${batch.id}`}
      />

      <div className="mt-8 space-y-6">
        <PageSection title={`Needs your action (${pending.length})`}>
          {pending.length === 0 ? (
            <EmptyState
              title={
                hydratedItems.length === 0
                  ? 'Reviewer approved every post'
                  : 'Every item handled'
              }
              description={
                hydratedItems.length === 0
                  ? 'No changes requested and no caption edits. You can move this batch forward.'
                  : 'You can start the next round whenever the team is ready.'
              }
            />
          ) : (
            <div className="space-y-3">
              {pending.map((item) => {
                const reviewItemId = item.id
                // Bind reviewItemId into closures over the server actions.
                // Server actions can be passed directly to client components;
                // the closure is serialized via the action reference + the
                // captured argument.
                const onAccept = async () => {
                  'use server'
                  await acceptCaptionEditAction({ reviewItemId })
                }
                const onReject = async () => {
                  'use server'
                  await rejectCaptionEditAction({ reviewItemId })
                }
                const onAddressed = async () => {
                  'use server'
                  await addressItemAction({ reviewItemId })
                }
                return (
                  <ReviewItemRow
                    key={item.id}
                    item={item}
                    postNumber={postNumberById.get(item.postId) ?? 0}
                    mode="pending"
                    onAccept={onAccept}
                    onReject={onReject}
                    onAddressed={onAddressed}
                  />
                )
              })}
            </div>
          )}
        </PageSection>

        {addressed.length > 0 && (
          <PageSection title={`Already addressed (${addressed.length})`}>
            <div className="space-y-3">
              {addressed.map((item) => (
                <ReviewItemRow
                  key={item.id}
                  item={item}
                  postNumber={postNumberById.get(item.postId) ?? 0}
                  mode="addressed"
                />
              ))}
            </div>
          </PageSection>
        )}

        {allAddressed && !isSuperseded && (
          <div className="flex justify-end" data-testid="start-next-round-row">
            <StartNextRoundButton
              magicLinkId={magicLink.id}
              nextRound={session.round + 1}
              onClick={async () => {
                'use server'
                await startNextRoundAction({ magicLinkId: magicLink.id })
              }}
            />
          </div>
        )}

        {isSuperseded && (
          <p
            data-testid="superseded-notice"
            className="text-center text-sm text-muted-foreground"
          >
            This review has been superseded by a newer round.{' '}
            <Link
              href={`/clients/${client.id}/batches/${batch.id}`}
              className="underline"
            >
              Back to the relay
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  )
}
