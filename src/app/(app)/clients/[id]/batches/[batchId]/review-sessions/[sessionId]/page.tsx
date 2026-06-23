/**
 * AM-side review session detail page — markup feedback shell layout.
 *
 * Renders the review session using the three-zone ReviewFeedbackShell:
 *   - Left rail: per-post feedback rows with accept/reject/mark-addressed
 *   - Center canvas: post images + client markup pins (read-only)
 *   - Right rail: sticky internal AM/designer chat thread
 *
 * Access control mirrors the batch page: requireClientViewer +
 * findClientForUser, then walk magicLink -> batch -> client.
 */

import Link from 'next/link'
import {
  requireClientViewer,
  canEditClients,
  canUploadPostMedia,
  canComment,
} from '@/server/middleware/permissions'
import { redirectAccessDenied } from '@/server/auth/access'
import { findClientForUser } from '@/server/repositories/clients'
import { findBatch } from '@/server/repositories/batches'
import { findSessionWithItems } from '@/server/repositories/reviewSessions'
import {
  listClientThreadsForBatch,
  type HydratedThread,
} from '@/server/repositories/threads'
import {
  listActivityForClient,
  visibilityForViewer,
} from '@/server/repositories/activityEvents'
import { listMembershipsForOrg } from '@/server/repositories/memberships'
import { buildMentionRoster } from '@/lib/mentions'
import { db } from '@/db/client'
import { ReviewSessionHeader } from '@/components/review/review-session-header'
import { type HydratedItemWithPost } from '@/components/review/review-item-row'
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
  useCommentImageAsPostMediaAction as commentImageAsPostMediaAction,
} from '@/server/actions/threads'
import { revalidatePath } from 'next/cache'
import { ActivityThread } from '@/components/activity/activity-thread'
import { MobileThreadFab } from '@/components/activity/mobile-thread-fab'
import { ReviewFeedbackShell } from './review-feedback-shell'
import type { FeedbackPostVM, FeedbackActions } from './review-feedback-types'
import type { ReviewSessionSummary } from '@/types/review-session'

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

  // Load activity events and mention roster for the internal revision chat.
  const [activityEvents, memberships] = await Promise.all([
    listActivityForClient(client.id, {
      limit: 30,
      visibilityFilter: visibilityForViewer(ctx),
    }),
    listMembershipsForOrg(ctx.organizationDbId),
  ])
  const mentionTargets = buildMentionRoster(memberships)

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

  // Designer lane: designers see ONLY attention posts that carry at least one
  // IMAGE pin. AM/admin see every attention post.
  const isDesigner = ctx.role === 'designer'
  function hasImagePin(ap: AttentionPost): boolean {
    return ap.clientThreads.some((t) => t.pin.kind === 'image')
  }
  const visiblePosts = isDesigner ? attention.filter(hasImagePin) : attention

  const pending = visiblePosts.filter((a) => !a.handled)

  const summary: ReviewSessionSummary =
    session.submittedSummary ?? {
      approved: session.items.filter((i) => i.decision === 'approved').length,
      changesRequested: session.items.filter((i) => i.decision === 'changes_requested').length,
      captionEdited: session.items.filter((i) => i.decision === 'caption_edited').length,
      totalPosts: session.items.length,
    }

  const submittedAt = session.submittedAt ?? session.startedAt
  const allAddressed = pending.length === 0 && visiblePosts.length > 0
  const isSuperseded = session.status === 'superseded'

  // Capture primitives for server-action closures.
  const clientId_ = client.id
  const batchId_ = batch.id
  const sessionId_ = session.id
  const sessionRound = session.round

  // Edit/upload permissions (server-computed from OrgContext).
  const canUploadImage = canUploadPostMedia(ctx)
  const canPostComment = canComment(ctx)
  // Designers can upload images but cannot edit captions, accept/reject, or
  // mark addressed — those are AM-only.
  void canEditClients // retained for future use; not needed in the shell layout

  // ---------------------------------------------------------------------------
  // Hoist server actions into a FeedbackActions object.
  // Each fn is a 'use server' async function capturing the session primitives.
  // ---------------------------------------------------------------------------

  const comment = async (
    threadId: string,
    body: string,
    image?: { url: string; width?: number; height?: number },
  ) => {
    'use server'
    await addCommentAction({ threadId, body, image })
    revalidatePath(
      `/clients/${clientId_}/batches/${batchId_}/review-sessions/${sessionId_}`,
    )
  }

  const resolve = async (threadId: string) => {
    'use server'
    await resolveThreadAction({ threadId, resolvedReason: null })
    revalidatePath(
      `/clients/${clientId_}/batches/${batchId_}/review-sessions/${sessionId_}`,
    )
  }

  const useAsPostImage = async (postId: string, commentId: string) => {
    'use server'
    await commentImageAsPostMediaAction({ postId, commentId })
    revalidatePath(
      `/clients/${clientId_}/batches/${batchId_}/review-sessions/${sessionId_}`,
    )
  }

  const acceptCaption = async (reviewItemId: string) => {
    'use server'
    await acceptCaptionEditAction({ reviewItemId })
    revalidatePath(
      `/clients/${clientId_}/batches/${batchId_}/review-sessions/${sessionId_}`,
    )
  }

  const rejectCaption = async (reviewItemId: string) => {
    'use server'
    await rejectCaptionEditAction({ reviewItemId })
    revalidatePath(
      `/clients/${clientId_}/batches/${batchId_}/review-sessions/${sessionId_}`,
    )
  }

  const markAddressed = async (postId: string, reviewItemId: string | null) => {
    'use server'
    await markPostAddressedAction({
      postId,
      reviewItemId: reviewItemId ?? undefined,
      reviewSessionId: sessionId_,
    })
    revalidatePath(
      `/clients/${clientId_}/batches/${batchId_}/review-sessions/${sessionId_}`,
    )
  }

  const unmarkAddressed = async (postId: string, reviewItemId: string | null) => {
    'use server'
    await unmarkPostAddressedAction({
      postId,
      reviewItemId: reviewItemId ?? undefined,
      reviewSessionId: sessionId_,
    })
    revalidatePath(
      `/clients/${clientId_}/batches/${batchId_}/review-sessions/${sessionId_}`,
    )
  }

  const startNextRound = async () => {
    'use server'
    await startNextRoundAction({ magicLinkId: magicLink.id })
  }

  const feedbackActions: FeedbackActions = {
    comment,
    resolve,
    useAsPostImage,
    acceptCaption,
    rejectCaption,
    markAddressed,
    unmarkAddressed,
    startNextRound,
  }

  // ---------------------------------------------------------------------------
  // Build FeedbackPostVM[] from visiblePosts.
  // ---------------------------------------------------------------------------

  const feedbackPosts: FeedbackPostVM[] = visiblePosts.map((ap) => ({
    postId: ap.postId,
    postNumber: ap.postNumber,
    caption: ap.post.caption,
    mediaUrls: ap.post.mediaUrls,
    postDate:
      ap.post.postDate instanceof Date
        ? ap.post.postDate.toISOString()
        : String(ap.post.postDate),
    verdict:
      ap.item?.decision === 'approved'
        ? 'approved'
        : ap.item?.decision === 'changes_requested'
          ? 'changes_requested'
          : ap.item?.decision === 'caption_edited'
            ? 'caption_edited'
            : 'none',
    suggestedCaption: ap.item?.suggestedCaption ?? null,
    reviewItemId: ap.item?.id ?? null,
    addressed: ap.handled,
    threads: ap.clientThreads,
  }))

  // Map ctx.role to the shell's role union.
  // uploadImage requires a browser File object — not constructible as a server
  // action. Pass undefined; the rail image-attach affordance is suppressed.
  // The canUploadImage flag is retained for reference but the actual upload
  // callback must live in a client component. For now this is an accepted
  // limitation: image attach in this page's rail requires a follow-up client
  // wrapper. See WORKLOG for concern note.
  void canUploadImage

  const shellRole =
    ctx.role === 'admin'
      ? ('admin' as const)
      : ctx.role === 'designer'
        ? ('designer' as const)
        : ctx.role === 'account_manager'
          ? ('am' as const)
          : ('am' as const)

  return (
    <div className="px-4 py-8 md:px-8 md:py-10">
      <ReviewSessionHeader
        reviewerName={reviewerName}
        reviewerEmail={reviewerEmail}
        round={sessionRound}
        submittedAt={submittedAt}
        summary={summary}
        backHref={`/clients/${client.id}/batches/${batch.id}`}
      />

      {isSuperseded && (
        <p
          data-testid="superseded-notice"
          className="mt-4 text-center text-sm text-muted-foreground"
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

      <div className="mt-6">
        <ReviewFeedbackShell
          posts={feedbackPosts}
          actions={feedbackActions}
          role={shellRole}
          isDesigner={isDesigner}
          canPostComment={canPostComment}
          allAddressed={allAddressed}
          isSuperseded={isSuperseded}
          uploadImage={undefined}
          startNextRoundSlot={
            <StartNextRoundButton
              magicLinkId={magicLink.id}
              nextRound={sessionRound + 1}
              onClick={async () => {
                'use server'
                await startNextRoundAction({ magicLinkId: magicLink.id })
              }}
            />
          }
          internalThread={
            <div
              aria-label="Internal thread"
              data-testid="review-activity-thread"
              className="hidden overflow-hidden rounded-2xl bg-card lg:flex lg:h-[36rem] lg:max-h-[calc(100dvh-5rem)] lg:flex-col"
            >
              <h2 className="shrink-0 px-4 pt-4 pb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Internal thread
              </h2>
              <div className="min-h-0 flex-1 px-4 pb-4">
                <ActivityThread
                  clientId={client.id}
                  events={activityEvents}
                  mentionTargets={mentionTargets}
                  hideComposer={!canPostComment}
                />
              </div>
            </div>
          }
        />
        <MobileThreadFab
          clientId={client.id}
          events={activityEvents}
          mentionTargets={mentionTargets}
          hideComposer={!canPostComment}
        />
      </div>
    </div>
  )
}
