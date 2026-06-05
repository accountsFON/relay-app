/**
 * AM-side review session detail page.
 *
 * Renders one submitted ReviewSession as a list of "attention posts" -- the
 * union of (a) posts with a non-approved ReviewItem and (b) posts the client
 * left markup pins on. Each card shows the item decision UI (ReviewItemRow)
 * and/or the client pins (ReviewPinnedPost), plus a single post-level
 * "Mark addressed" button that records the item addressed AND resolves the
 * post's open client pins.
 *
 * A post is "handled" when its item (if any) is addressed AND it has no open
 * client pins. Because the predicate reads live pin status, resolving a pin
 * anywhere (here or the preview page) reflects in both places with no extra
 * write. StartNextRound enables only when every attention post is handled.
 *
 * Access control mirrors the batch page: requireClientViewer +
 * findClientForUser, then walk magicLink -> batch -> client.
 */

import Link from 'next/link'
import { requireClientViewer } from '@/server/middleware/permissions'
import { redirectAccessDenied } from '@/server/auth/access'
import { findClientForUser } from '@/server/repositories/clients'
import { findBatch } from '@/server/repositories/batches'
import { findSessionWithItems } from '@/server/repositories/reviewSessions'
import {
  listClientThreadsForBatch,
  type HydratedThread,
} from '@/server/repositories/threads'
import { db } from '@/db/client'
import { PageSection } from '@/components/ui/page-section'
import { EmptyState } from '@/components/ui/empty-state'
import { ReviewSessionHeader } from '@/components/review/review-session-header'
import {
  ReviewItemRow,
  type HydratedItemWithPost,
} from '@/components/review/review-item-row'
import { ReviewPinnedPost } from '@/components/review/review-pinned-post'
import { MarkAddressedButton } from '@/components/review/mark-addressed-button'
import { StartNextRoundButton } from '@/components/review/start-next-round-button'
import {
  acceptCaptionEditAction,
  rejectCaptionEditAction,
  startNextRoundAction,
  markPostAddressedAction,
  unmarkPostAddressedAction,
} from '@/server/actions/reviewSessions'
import {
  resolveThreadAction,
  addCommentAction,
} from '@/server/actions/threads'
import { revalidatePath } from 'next/cache'
import type { ReviewSessionSummary } from '@/types/review-session'

function formatPostDate(date: Date): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(date)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

type AttentionPost = {
  postId: string
  postNumber: number
  post: { id: string; postDate: Date; caption: string; mediaUrls: string[] }
  item: HydratedItemWithPost | null
  clientThreads: HydratedThread[]
  handled: boolean
}

export default async function ReviewSessionDetailPage({
  params,
}: {
  params: Promise<{ id: string; batchId: string; sessionId: string }>
}) {
  const ctx = await requireClientViewer()
  const { id, batchId, sessionId } = await params

  const client = await findClientForUser(ctx, id)
  if (!client) redirectAccessDenied()

  const batch = await findBatch(batchId)
  if (!batch || batch.clientId !== client.id) redirectAccessDenied()

  const session = await findSessionWithItems({ reviewSessionId: sessionId })
  if (!session) redirectAccessDenied()

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

  const reviewer = session.reviewerId
    ? await db.magicLinkReviewer.findUnique({
        where: { id: session.reviewerId },
        select: { id: true, name: true, email: true },
      })
    : null

  const reviewerName = reviewer?.name ?? magicLink.defaultReviewerName
  const reviewerEmail = reviewer?.email ?? magicLink.defaultReviewerEmail ?? null

  // Whole-batch post map (1-indexed numbering matches the batch page).
  const batchPosts = await db.post.findMany({
    where: { batchId: batch.id },
    orderBy: { postDate: 'asc' },
    select: { id: true, postDate: true, caption: true, mediaUrls: true },
  })
  const postNumberById = new Map<string, number>()
  const postById = new Map<string, (typeof batchPosts)[number]>()
  batchPosts.forEach((p, idx) => {
    postNumberById.set(p.id, idx + 1)
    postById.set(p.id, p)
  })

  // Non-approved items, hydrated with their Post, keyed by postId.
  const itemByPostId = new Map<string, HydratedItemWithPost>()
  for (const item of session.items) {
    if (item.decision === 'approved' || item.decision === 'not_reviewed') continue
    const post = postById.get(item.postId)
    if (!post) continue
    itemByPostId.set(item.postId, {
      ...item,
      post: {
        id: post.id,
        postDate: post.postDate,
        caption: post.caption,
        mediaUrls: post.mediaUrls,
      },
    })
  }

  // Client pins (open + resolved) for every post in the batch.
  const clientThreadsByPost = await listClientThreadsForBatch({
    batchId: batch.id,
    includeResolved: true,
  })

  // Build the attention-post list: union of non-approved items and posts
  // with client pins.
  const attention: AttentionPost[] = []
  for (const p of batchPosts) {
    const item = itemByPostId.get(p.id) ?? null
    const clientThreads = clientThreadsByPost.get(p.id) ?? []
    if (!item && clientThreads.length === 0) continue

    const itemAddressed = item
      ? Boolean(item.acceptedAsPostVersionId) || item.addressedAt != null
      : true
    const openPins = clientThreads.filter((t) => t.status === 'open').length
    const handled = itemAddressed && openPins === 0

    attention.push({
      postId: p.id,
      postNumber: postNumberById.get(p.id) ?? 0,
      post: p,
      item,
      clientThreads,
      handled,
    })
  }
  attention.sort((a, b) => a.postNumber - b.postNumber)

  const pending = attention.filter((a) => !a.handled)
  const addressed = attention.filter((a) => a.handled)

  const summary: ReviewSessionSummary =
    session.submittedSummary ?? {
      approved: session.items.filter((i) => i.decision === 'approved').length,
      changesRequested: session.items.filter((i) => i.decision === 'changes_requested').length,
      captionEdited: session.items.filter((i) => i.decision === 'caption_edited').length,
      totalPosts: session.items.length,
    }

  const submittedAt = session.submittedAt ?? session.startedAt
  const allAddressed = pending.length === 0 && attention.length > 0
  const isSuperseded = session.status === 'superseded'
  // Extract primitives from session/client/batch before renderCard so the
  // closure captures typed consts, not the nullable variables.
  const clientId_ = client.id
  const batchId_ = batch.id
  const sessionId_ = session.id
  const sessionRound = session.round

  function renderCard(ap: AttentionPost, mode: 'pending' | 'addressed') {
    const reviewItemId = ap.item?.id

    const onAccept = ap.item
      ? async () => {
          'use server'
          await acceptCaptionEditAction({ reviewItemId: ap.item!.id })
        }
      : undefined
    const onReject = ap.item
      ? async () => {
          'use server'
          await rejectCaptionEditAction({ reviewItemId: ap.item!.id })
        }
      : undefined
    const onMarkAddressed = async () => {
      'use server'
      await markPostAddressedAction({
        postId: ap.postId,
        reviewItemId,
        reviewSessionId: sessionId_,
      })
    }
    const onUnmarkAddressed = async () => {
      'use server'
      await unmarkPostAddressedAction({
        postId: ap.postId,
        reviewItemId,
        reviewSessionId: sessionId_,
      })
    }
    const onResolvePin = async (threadId: string) => {
      'use server'
      await resolveThreadAction({ threadId, resolvedReason: null })
      revalidatePath(
        `/clients/${clientId_}/batches/${batchId_}/review-sessions/${sessionId_}`,
      )
    }
    const onCommentPin = async (threadId: string, body: string) => {
      'use server'
      await addCommentAction({ threadId, body })
      revalidatePath(
        `/clients/${clientId_}/batches/${batchId_}/review-sessions/${sessionId_}`,
      )
    }

    return (
      <div
        key={ap.postId}
        data-testid={`attention-post-${ap.postId}`}
        className="space-y-3"
      >
        {ap.item ? (
          <ReviewItemRow
            item={ap.item}
            postNumber={ap.postNumber}
            mode={mode}
            showAddressedButton={false}
            onAccept={onAccept}
            onReject={onReject}
          />
        ) : (
          <h3 className="text-sm font-semibold text-foreground">
            {`Post #${ap.postNumber} · ${formatPostDate(ap.post.postDate)}`}
          </h3>
        )}

        {ap.clientThreads.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {`Client pins (${ap.clientThreads.length})`}
            </p>
            <ReviewPinnedPost
              postId={ap.postId}
              mediaUrl={ap.post.mediaUrls[0] ?? null}
              caption={ap.post.caption}
              threads={ap.clientThreads}
              onResolve={mode === 'pending' ? onResolvePin : undefined}
              onComment={mode === 'pending' ? onCommentPin : undefined}
            />
          </div>
        )}

        <div className="flex justify-end">
          {mode === 'addressed' ? (
            <MarkAddressedButton
              onClick={onUnmarkAddressed}
              label={ap.item?.acceptedAsPostVersionId ? 'Undo accept' : 'Move back to unaddressed'}
              variant="outline"
              testId="unmark-post-addressed-button"
            />
          ) : (
            <MarkAddressedButton onClick={onMarkAddressed} />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-5xl">
      <ReviewSessionHeader
        reviewerName={reviewerName}
        reviewerEmail={reviewerEmail}
        round={sessionRound}
        submittedAt={submittedAt}
        summary={summary}
        backHref={`/clients/${client.id}/batches/${batch.id}`}
      />

      <div className="mt-8 space-y-6">
        <PageSection title={`Needs your action (${pending.length})`}>
          {pending.length === 0 ? (
            <EmptyState
              title={
                attention.length === 0
                  ? 'Nothing to act on'
                  : 'Every post handled'
              }
              description={
                attention.length === 0
                  ? 'No changes requested, no caption edits, and no open client pins. You can move this batch forward.'
                  : 'You can start the next round whenever the team is ready.'
              }
            />
          ) : (
            <div className="space-y-8">
              {pending.map((ap) => renderCard(ap, 'pending'))}
            </div>
          )}
        </PageSection>

        {addressed.length > 0 && (
          <PageSection title={`Already addressed (${addressed.length})`}>
            <div className="space-y-8">
              {addressed.map((ap) => renderCard(ap, 'addressed'))}
            </div>
          </PageSection>
        )}

        {allAddressed && !isSuperseded && (
          <div className="flex justify-end" data-testid="start-next-round-row">
            <StartNextRoundButton
              magicLinkId={magicLink.id}
              nextRound={sessionRound + 1}
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
