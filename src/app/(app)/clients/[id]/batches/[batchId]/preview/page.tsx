import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireClientViewer, canEditClients, canComment } from '@/server/middleware/permissions'
import { redirectAccessDenied } from '@/server/auth/access'
import { findClientForUser } from '@/server/repositories/clients'
import { findBatch } from '@/server/repositories/batches'
import { listThreadsForBatch } from '@/server/repositories/threads'
import {
  findActiveSession,
  startSession,
} from '@/server/repositories/reviewSessions'
import { internalMentionRosterForClient } from '@/server/lib/internalMentionRoster'
import { derivePostApprovalForBatch } from '@/server/services/approval'
import {
  listActivityForClient,
  visibilityForViewer,
} from '@/server/repositories/activityEvents'
import { listMembershipsForOrg } from '@/server/repositories/memberships'
import { buildMentionRoster } from '@/lib/mentions'
import { db } from '@/db/client'
import { HeroBand } from '@/components/hero-band'
import { MarkBatchReviewedButton } from '@/components/preview/mark-batch-reviewed-button'
import { PreviewPageShell } from './preview-page-shell'
import { InternalReviewShell } from '@/components/review/internal-review-shell'
import { MobileThreadFab } from '@/components/activity/mobile-thread-fab'
import { EventAnchor } from '@/components/notifications/event-anchor'
import { Button } from '@/components/ui/button'
import type {
  ReviewItemHydrated,
  ReviewSessionStatusType,
} from '@/types/review-session'

/**
 * Internal batch preview page (`/preview`).
 *
 * For an AM/editor this is the Clerk-authed verdict surface (Phase 2): a
 * resume-or-create INTERNAL ReviewSession (Phase 1) rendered through
 * `InternalReviewShell` — per-post Approve / Request changes, Notes, inline
 * caption edit, image/caption pins, progress, Approve all, and Submit. Submit
 * routes through `submitInternalReviewAction`, which advances the Design Review
 * step only when the batch is at `am_review_design` (Phase 1 guard).
 *
 * For a non-editor viewer the page keeps the existing read-only feed
 * (`PreviewPageShell`) so view-only access is unaffected.
 *
 * Auth: standard client.view gate via requireClientViewer + findClientForUser
 * scoping. The verdict surface itself is gated on `canEditClients`.
 */
export default async function BatchPreviewPage({
  params,
}: {
  params: Promise<{ id: string; batchId: string }>
}) {
  const ctx = await requireClientViewer()
  const { id, batchId } = await params

  const client = await findClientForUser(ctx, id)
  if (!client) redirectAccessDenied()

  const batch = await findBatch(batchId)
  if (!batch || batch.clientId !== client.id) redirectAccessDenied()

  // canEdit gates the AM-only verdict surface + review controls.
  const canEdit = canEditClients(ctx)

  const posts = await db.post.findMany({
    where: { batchId: batch.id, deletedAt: null },
    orderBy: { postDate: 'asc' },
    select: {
      id: true,
      postDate: true,
      caption: true,
      hashtags: true,
      mediaUrls: true,
    },
  })

  const [threadsByPost, approvalCounts, mentionRoster] = await Promise.all([
    listThreadsForBatch({ batchId: batch.id }),
    derivePostApprovalForBatch(batch.id),
    internalMentionRosterForClient(client.id),
  ])

  const heroBand = (
    <HeroBand
      title={`${batch.label} internal review`}
      subtitle={`${client.name} · ${approvalCounts.ready} ready · ${approvalCounts.pending} pending`}
      breadcrumb={[
        { label: 'My Relay', href: '/dashboard' },
        { label: client.name, href: `/clients/${client.id}` },
        { label: batch.label, href: `/clients/${client.id}/batches/${batch.id}` },
        { label: 'Internal Review' },
      ]}
    />
  )

  const backToRelay = (
    <Button
      variant="secondary"
      size="sm"
      render={<Link href={`/clients/${client.id}/batches/${batch.id}`} />}
    >
      <ChevronLeft className="text-muted-foreground" />
      <span>Back to relay</span>
    </Button>
  )

  // ---- AM / editor: the internal verdict surface ----
  if (canEdit) {
    // Resume the AM's active internal session for this batch, or create one on
    // open (mirrors the client opening the magic link). Idempotent: a fresh
    // session is only created when none is in_progress for this AM.
    let session = await findActiveSession({
      kind: 'internal',
      batchId: batch.id,
      reviewerUserId: ctx.userDbId,
    })
    if (!session) {
      session = await startSession({
        kind: 'internal',
        batchId: batch.id,
        reviewerUserId: ctx.userDbId,
        round: 1,
      })
    }

    const itemRows = await db.reviewItem.findMany({
      where: { reviewSessionId: session.id },
    })
    const initialItems: ReviewItemHydrated[] = itemRows.map((it) => ({
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
    }))

    const feedPosts = posts.map((p) => ({
      post: {
        id: p.id,
        caption: p.caption,
        hashtags: p.hashtags,
        mediaUrl: p.mediaUrls?.[0] ?? null,
      },
      threads: threadsByPost.get(p.id) ?? [],
    }))

    // The AM's display name for the "Reviewing as" line.
    const reviewer = await db.user.findUnique({
      where: { id: ctx.userDbId },
      select: { name: true },
    })

    // Load activity events and mention roster for the internal AM/designer chat.
    const [activityEvents, memberships] = await Promise.all([
      listActivityForClient(client.id, {
        limit: 30,
        visibilityFilter: visibilityForViewer(ctx),
      }),
      listMembershipsForOrg(ctx.organizationDbId),
    ])
    const mentionTargets = buildMentionRoster(memberships)
    const canPostComment = canComment(ctx)

    return (
      <div className="px-6 py-10 md:px-12 md:py-14 max-w-7xl">
        <EventAnchor />
        {heroBand}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <MarkBatchReviewedButton
            batchId={batch.id}
            openThreadCount={feedPosts.reduce(
              (sum, p) => sum + p.threads.filter((t) => t.status === 'open').length,
              0,
            )}
          />
          {backToRelay}
        </div>

        <div className="mt-8">
          <InternalReviewShell
            batchId={batch.id}
            clientName={client.name}
            batchLabel={batch.label}
            reviewerName={reviewer?.name ?? 'You'}
            reviewerUserId={ctx.userDbId}
            mentionRoster={mentionRoster}
            posts={feedPosts}
            initialItems={initialItems}
            sessionStatus={session.status as ReviewSessionStatusType}
          />
        </div>
        <MobileThreadFab
          clientId={client.id}
          events={activityEvents}
          mentionTargets={mentionTargets}
          hideComposer={!canPostComment}
          showOnDesktop
          // Lift the FAB above the sticky Submit bar so it doesn't overlap the
          // full-width Submit CTA on narrow phones. Only while the bar is
          // present (session not yet submitted); once submitted the bar is gone
          // and the FAB returns to its default corner.
          className={session.status !== 'submitted' ? 'bottom-[88px]' : undefined}
        />
      </div>
    )
  }

  // ---- Non-editor viewer: the existing read-only feed ----
  const hydratedPosts = posts.map((p) => ({
    id: p.id,
    caption: p.caption,
    hashtags: p.hashtags,
    mediaUrl: p.mediaUrls?.[0] ?? null,
    postDate: p.postDate,
    threads: threadsByPost.get(p.id) ?? [],
  }))

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-7xl">
      <EventAnchor />
      {heroBand}
      <div className="mt-5 flex flex-wrap items-center gap-2">{backToRelay}</div>

      <div className="mt-8">
        <PreviewPageShell
          client={{ id: client.id, name: client.name }}
          posts={hydratedPosts}
          canEdit={canEdit}
          userDbId={ctx.userDbId}
          mentionRoster={mentionRoster}
        />
      </div>
    </div>
  )
}
