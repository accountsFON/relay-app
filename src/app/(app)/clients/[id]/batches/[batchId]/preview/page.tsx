import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import {
  requireClientViewer,
  canEditClients,
  canComment,
  canUploadPostMedia,
} from '@/server/middleware/permissions'
import { redirectAccessDenied } from '@/server/auth/access'
import { findClientForUser } from '@/server/repositories/clients'
import { findBatch, listChecklistForBatch } from '@/server/repositories/batches'
import { listThreadsForBatch } from '@/server/repositories/threads'
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
import { RequestChangesButton } from '@/components/review/request-changes-button'
import { MarkRevisionsDoneButton } from '@/components/review/mark-revisions-done-button'
import { PreviewPageShell } from './preview-page-shell'
import { InternalReviewShell } from '@/components/review/internal-review-shell'
import { MobileThreadFab } from '@/components/activity/mobile-thread-fab'
import { EventAnchor } from '@/components/notifications/event-anchor'
import { Button } from '@/components/ui/button'
import {
  requestDesignChangesAction,
  markDesignRevisionsDoneAction,
} from '@/server/actions/relay'
import { RelayStep } from '@prisma/client'
import { isRelayLocked } from '@/lib/relay-lock'
import { legalNextSteps } from '@/server/lib/relay-state-machine'

/**
 * Internal batch preview page (`/preview`).
 *
 * Shared markup-only surface for the AM and the assigned designer. No internal
 * ReviewSession is created or read here — the verdict/submit loop has been
 * removed. Pins and thread replies route through the Clerk-authed thread
 * actions, same as before.
 *
 * Tiers:
 *   AM (canEditClients)        — InternalReviewShell, canEditCaption=true,
 *                                allowPostPins=true, AM controls (Request
 *                                changes + Mark relay reviewed).
 *   Assigned designer           — InternalReviewShell, canEditCaption=false,
 *                                allowPostPins=false (image pins + replies
 *                                kept), designer controls (Mark revisions done
 *                                when awaiting_design_revisions).
 *   Everyone else               — read-only PreviewPageShell (unchanged).
 *
 * Auth: standard client.view gate via requireClientViewer + findClientForUser
 * scoping.
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

  const canEdit = canEditClients(ctx)
  const isAssignedDesigner =
    !canEdit && ctx.userDbId === client.assignedDesignerId
  const isLocked = isRelayLocked(batch.currentStep)
  // Drag/click "Replace image" affordance on the internal surface. Gated on the
  // `post.media.edit` permission (admin/AM/designer true, client false) and
  // suppressed once the relay is locked, matching the image-upload suppression.
  const canReplaceImage = canUploadPostMedia(ctx) && !isLocked

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

  // ---- AM / editor: markup surface + AM controls ----
  if (canEdit || isAssignedDesigner) {
    const feedPosts = posts.map((p) => ({
      post: {
        id: p.id,
        caption: p.caption,
        hashtags: p.hashtags,
        mediaUrl: p.mediaUrls?.[0] ?? null,
      },
      threads: threadsByPost.get(p.id) ?? [],
    }))

    // Reviewer display name for the "Reviewing as" line.
    const reviewer = await db.user.findUnique({
      where: { id: ctx.userDbId },
      select: { name: true },
    })

    // Assigned designer's display name for the "Request changes" confirmation.
    const assignedDesigner = client.assignedDesignerId
      ? await db.user.findUnique({
          where: { id: client.assignedDesignerId },
          select: { name: true },
        })
      : null

    // Activity events + mention targets for the internal chat FAB, plus the
    // batch's checklist (rendered inside the Mark relay reviewed confirm modal).
    const [activityEvents, memberships, checklist] = await Promise.all([
      listActivityForClient(client.id, {
        limit: 30,
        visibilityFilter: visibilityForViewer(ctx),
      }),
      listMembershipsForOrg(ctx.organizationDbId),
      listChecklistForBatch(batch.id),
    ])
    const mentionTargets = buildMentionRoster(memberships)
    const canPostComment = canComment(ctx)

    // AM controls: Request changes + Mark relay reviewed, both only at
    // am_review_design (the internal design-review step). Gating Mark relay
    // reviewed to this step stops it reappearing + advancing again at later
    // steps (the P1 #12 double-click bug).
    const forwardStepCount = legalNextSteps(
      batch.currentStep,
      batch.clientReviewEnabled,
    ).filter((t) => t.direction === 'forward').length

    const reviewChecklistItems = checklist
      .filter((i) => i.step === batch.currentStep)
      .map((i) => ({
        id: i.id,
        label: i.label,
        required: i.required,
        checked: i.checked,
      }))

    const amControlsSlot =
      canEdit && batch.currentStep === RelayStep.am_review_design ? (
        <>
          <RequestChangesButton
            designerName={assignedDesigner?.name ?? null}
            onClick={async () => {
              'use server'
              await requestDesignChangesAction({ batchId: batch.id })
            }}
          />
          <MarkBatchReviewedButton
            batchId={batch.id}
            openThreadCount={feedPosts.reduce(
              (sum, p) => sum + p.threads.filter((t) => t.status === 'open').length,
              0,
            )}
            canAdvance={forwardStepCount === 1}
            checklistItems={reviewChecklistItems}
            canTick={canEdit}
          />
        </>
      ) : undefined

    // Designer controls: Mark revisions done only when awaiting revisions.
    const designerControlsSlot =
      isAssignedDesigner &&
      batch.currentStep === RelayStep.am_review_design &&
      batch.currentSubState === 'awaiting_design_revisions' ? (
        <MarkRevisionsDoneButton
          onClick={async () => {
            'use server'
            await markDesignRevisionsDoneAction({ batchId: batch.id })
          }}
          openThreadCount={feedPosts.reduce(
            (sum, p) => sum + p.threads.filter((t) => t.status === 'open').length,
            0,
          )}
        />
      ) : undefined

    return (
      <div className="px-6 py-10 md:px-12 md:py-14 max-w-7xl">
        <EventAnchor />
        {heroBand}
        <div className="mt-5 flex flex-wrap items-center gap-2">{backToRelay}</div>

        <div className="mt-8">
          <InternalReviewShell
            batchId={batch.id}
            clientName={client.name}
            reviewerName={reviewer?.name ?? 'You'}
            reviewerUserId={ctx.userDbId}
            mentionRoster={mentionRoster}
            posts={feedPosts}
            canEditCaption={canEdit}
            allowPostPins={canEdit}
            canReplaceImage={canReplaceImage}
            locked={isLocked}
            amControlsSlot={amControlsSlot}
            designerControlsSlot={designerControlsSlot}
          />
        </div>
        <MobileThreadFab
          clientId={client.id}
          events={activityEvents}
          mentionTargets={mentionTargets}
          hideComposer={!canPostComment}
          showOnDesktop
        />
      </div>
    )
  }

  // ---- Non-editor, non-designer viewer: the existing read-only feed ----
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
