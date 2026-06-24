import { RelayStep } from '@prisma/client'
import { requireClientViewer, canEditClients, canUploadPostMedia, canComment } from '@/server/middleware/permissions'
import { redirectAccessDenied } from '@/server/auth/access'
import { findClientForUser } from '@/server/repositories/clients'
import { findBatch } from '@/server/repositories/batches'
import {
  listActivityForClient,
  visibilityForViewer,
} from '@/server/repositories/activityEvents'
import { listMembershipsForOrg } from '@/server/repositories/memberships'
import { can } from '@/server/auth/permissions'
import { buildMentionRoster } from '@/lib/mentions'
import { ClientTeamHeader } from '@/components/clients/client-team-header'
import { db } from '@/db/client'
import {
  legalNextSteps,
  legalSendBackTargets,
} from '@/server/lib/relay-state-machine'
import { HeroBand } from '@/components/hero-band'
import { PageSection } from '@/components/ui/page-section'
import { EmptyState } from '@/components/ui/empty-state'
import { RelayTrack } from '@/components/relay/relay-track'
import { ChecklistPanel } from '@/components/relay/checklist-panel'
import { ClientDecisionPanel } from '@/components/relay/client-decision-panel'
import { CopySubStatePanel } from '@/components/relay/copy-substate-panel'
import { ActivityThread } from '@/components/activity/activity-thread'
import { MobileThreadFab } from '@/components/activity/mobile-thread-fab'
import { STEP_LABEL } from '@/components/relay/labels'
import { relayStepLabel } from '@/lib/relay-step-labels'
import { passBaton } from '@/server/services/relay'
import { parseDateScope } from '@/lib/date-scope'
import { findRunForBatch } from '@/server/repositories/contentRuns'
import { listVersionsForPost } from '@/server/services/postVersions'
import { resolveBatchTargetMonth } from '@/lib/batch-target-month'
import { resolveCanvaUrl } from '@/lib/canva'
import { canOverrideHolder } from '@/lib/relay-holder-override'
import { isRelayCelebrationStep } from '@/lib/relay-celebration'
import {
  buildClerkPhotoMap,
  resolveCelebrationParticipants,
} from '@/lib/celebration-avatars'
import { clerkClient } from '@clerk/nextjs/server'
import { PostCard } from '@/components/posts/post-card'
import { EventAnchor } from '@/components/notifications/event-anchor'
import {
  PostListCollapseProvider,
  PostListExpandAllToggle,
} from '@/components/posts/post-list-collapse'
import { PostVersionHistory } from '@/components/posts/post-version-history'
import { CostBreakdown } from '@/components/runs/cost-breakdown'
import { FailedRunBanner } from '@/components/runs/failed-run-banner'
import { ExportButton } from '@/components/runs/export-button'
import { GenerateContentDialog } from '@/components/relay/generate-content-dialog'
import { ArchiveBatchButton } from '@/components/relay/archive-batch-button'
import { SendLinkButton } from '@/components/batch/send-link-button'
import { OpenClientContentButton } from '@/components/batch/open-client-content-button'
import { Button } from '@/components/ui/button'
import { MagicLinkRow } from '@/components/batch/magic-link-row'
import { listSessionsForBatch } from '@/server/repositories/reviewSessions'
import { RestoreBatchBanner } from '@/components/relay/restore-batch-button'
import { BatchCompletionLap } from '@/components/relay/batch-completion-lap'
import { Palette, ExternalLink, Eye } from 'lucide-react'
import Link from 'next/link'

export default async function BatchDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; batchId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireClientViewer()
  const canEdit = canEditClients(ctx)
  // Composer gates on the narrow client.comment permission (admin / AM /
  // designer), NOT client.edit — designers post thread comments without
  // edit rights. Mirrors the postCommentAction server gate.
  const canPostComment = canComment(ctx)
  const canUploadMedia = canUploadPostMedia(ctx)
  const { id, batchId } = await params
  const sp = await searchParams
  const dateScope = parseDateScope({
    scope: typeof sp.scope === 'string' ? sp.scope : null,
    from: typeof sp.from === 'string' ? sp.from : null,
    to: typeof sp.to === 'string' ? sp.to : null,
  })

  const client = await findClientForUser(ctx, id)
  if (!client) redirectAccessDenied()

  // findBatch now uses withArchived() so archived batches still load.
  let batch = await findBatch(batchId)
  if (!batch || batch.clientId !== client.id) redirectAccessDenied()

  // Spec § Verification step 9: client opening at sent_to_client auto-advances
  // to client_decision. Best-effort; failure logs and renders prior step.
  // Skip auto-advance when batch is archived (read-only).
  if (
    !batch.deletedAt &&
    ctx.role === 'client' &&
    batch.currentStep === RelayStep.sent_to_client &&
    batch.currentHolder === ctx.userDbId
  ) {
    try {
      await passBaton({
        batchId: batch.id,
        toStep: RelayStep.client_decision,
        actorId: ctx.userDbId,
        actorOrganizationId: ctx.organizationDbId,
      })
      const refreshed = await findBatch(batchId)
      if (refreshed) batch = refreshed
    } catch (err) {
      console.error('[batch-detail] auto-advance 9→10 failed', err)
    }
  }

  // Resolve the display name for the user who archived the batch (if any).
  let archivedByName: string | null = null
  if (batch.deletedAt && batch.deletedBy) {
    const actor = await db.user.findUnique({
      where: { id: batch.deletedBy },
      select: { name: true },
    })
    archivedByName = actor?.name ?? null
  }

  const [events, posts, memberships, magicLinks, reviewSessions] = await Promise.all([
    listActivityForClient(client.id, {
      limit: 30,
      visibilityFilter: visibilityForViewer(ctx),
      dateRange: { from: dateScope.from, to: dateScope.to },
    }),
    db.post.findMany({
      where: { batchId: batch.id },
      orderBy: { postDate: 'asc' },
      select: {
        id: true,
        postDate: true,
        caption: true,
        hashtags: true,
        graphicHook: true,
        designerNotes: true,
        contentRunId: true,
        deletedAt: true,
        mediaUrls: true,
      },
    }),
    listMembershipsForOrg(ctx.organizationDbId),
    db.magicLink.findMany({
      where: { batchId: batch.id, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        defaultReviewerName: true,
        defaultReviewerEmail: true,
        expiresAt: true,
        lastVisitedAt: true,
      },
    }),
    listSessionsForBatch(batchId),
  ])
  const canManageTeam = can(ctx, 'admin.portal')
  // Cost breakdown is spend-sensitive: admins + platform owner only. AMs,
  // designers, and clients do not see it.
  const canViewCost = can(ctx, 'cost.viewAll')
  const mentionTargets = buildMentionRoster(memberships)

  // Mirror /clients/[id]/page.tsx: role-filtered option lists plus enriched
  // assigned ids for the AM/Designer pills in the team header.
  const amOptions = memberships
    .filter((m) => m.role === 'account_manager' || m.role === 'admin')
    .map((m) => ({ id: m.user.id, name: m.user.name }))
  const designerOptions = memberships
    .filter((m) => m.role === 'designer' || m.role === 'admin')
    .map((m) => ({ id: m.user.id, name: m.user.name }))
  const userIndex = new Map(memberships.map((m) => [m.user.id, m.user]))
  const assignedAm = client.assignedAmId
    ? (userIndex.get(client.assignedAmId) ?? null)
    : null
  const assignedDesigner = client.assignedDesignerId
    ? (userIndex.get(client.assignedDesignerId) ?? null)
    : null

  const sendBackTargets = legalSendBackTargets(batch.currentStep, batch.clientReviewEnabled).map((step) => ({
    step,
    label: STEP_LABEL[step],
  }))
  const forwardTransitions = legalNextSteps(batch.currentStep, batch.clientReviewEnabled).filter(
    (t) => t.direction === 'forward' || t.direction === 'auto',
  )
  const nextStep =
    forwardTransitions.length === 1 ? forwardTransitions[0].to : undefined
  const FORWARD_LABEL_OVERRIDE: Partial<Record<RelayStep, string>> = {
    [RelayStep.sent_to_client]: 'Send back to client for re-review',
    [RelayStep.final_qa_schedule]: 'Proceed to scheduling',
  }
  const legalForwardTargets =
    forwardTransitions.length > 1
      ? forwardTransitions.map((t) => ({
          step: t.to,
          label: FORWARD_LABEL_OVERRIDE[t.to] ?? `Pass to ${STEP_LABEL[t.to]}`,
        }))
      : undefined

  const daysOnCurrentStep = Math.max(
    0,
    Math.floor(
      (Date.now() - batch.createdAt.getTime()) / (24 * 60 * 60 * 1000),
    ),
  )

  const batchSummary = {
    id: batch.id,
    clientId: batch.clientId,
    label: batch.label,
    currentStep: batch.currentStep,
    currentSubState: batch.currentSubState,
    currentRole: batch.currentRole,
    scheduledAt: batch.scheduledAt,
    createdAt: batch.createdAt,
    clientReviewEnabled: batch.clientReviewEnabled,
    autoAdvanceOnTimeout: batch.autoAdvanceOnTimeout,
    holder: {
      id: batch.holder.id,
      name: batch.holder.name,
    },
    daysOnCurrentStep,
  }

  // canAct mirrors the server-side holder-override gate on passBatonAction /
  // sendBackBatonAction / finishBatchAction: holder always acts, plus AMs +
  // admins + platformOwner can override regardless of who holds. Without
  // this, the server would permit the call but no UI button would render.
  const canAct =
    batch.currentHolder === ctx.userDbId ||
    canOverrideHolder(ctx.role, ctx.platformOwner)
  // Force step is admin role + platform owner only (stricter than canAct).
  // AMs are NOT included; to reverse a batch they use the normal Send Back path.
  const canForceStep = ctx.role === 'admin' || ctx.platformOwner === true
  // Actions (generate content, export, archive) are unavailable on archived batches.
  const isLive = !batch.deletedAt

  const run = await findRunForBatch(batch.id)
  const targetMonth = resolveBatchTargetMonth(batch, run)

  // Pull breakdown + duration + errorContext from run.tokenUsage, mirroring
  // the runs/[runId] page parsing (which is being deprecated).
  const tokenUsage =
    run?.tokenUsage && typeof run.tokenUsage === 'object'
      ? (run.tokenUsage as Record<string, unknown>)
      : null
  const breakdown =
    tokenUsage && 'breakdown' in tokenUsage
      ? (tokenUsage.breakdown as Parameters<typeof CostBreakdown>[0]['breakdown'])
      : null
  const pipelineDurationSeconds =
    tokenUsage && 'pipelineDurationSeconds' in tokenUsage
      ? Number((tokenUsage as Record<string, unknown>).pipelineDurationSeconds)
      : null
  const errorContext =
    tokenUsage && 'errorContext' in tokenUsage
      ? (tokenUsage.errorContext as {
          name?: string
          message?: string
          stack?: string | null
          capturedAt?: string
          failedStep?: string
        })
      : null

  const isClientDecisionView =
    ctx.role === 'client' &&
    batch.currentStep === RelayStep.client_decision &&
    canAct
  const isCopyPreApproved =
    batch.currentStep === RelayStep.copy &&
    (batch.currentSubState ?? 'generating') !== 'approved'

  // Celebration participants: AM, Designer, current holder, and any linked
  // client users. Only loaded once the batch has reached the terminal
  // `completed` step (after the final step is finished), so the cost is paid
  // once per batch lifetime, not on every page render.
  const isBatchComplete = isRelayCelebrationStep(batch.currentStep)
  let celebrationParticipants: Array<{
    id: string
    name: string
    avatarUrl: string | null
  }> = []
  if (isBatchComplete) {
    const clientWithTeam = await db.client.findUnique({
      where: { id: client.id },
      select: { assignedAmId: true, assignedDesignerId: true },
    })
    const explicitIds = [
      clientWithTeam?.assignedAmId,
      clientWithTeam?.assignedDesignerId,
      batch.holder.id,
    ].filter((x): x is string => Boolean(x))
    const users = await db.user.findMany({
      where: {
        OR: [
          { id: { in: explicitIds } },
          { linkedClientId: client.id },
        ],
      },
      select: { id: true, name: true, avatarUrl: true, clerkUserId: true },
      take: 8,
    })
    // Dedupe while preserving a stable order: AM, Designer, holder, client(s).
    const seen = new Set<string>()
    const ordered: Array<{
      id: string
      name: string
      avatarUrl: string | null
      clerkUserId: string
    }> = []
    for (const id of explicitIds) {
      const u = users.find((x) => x.id === id)
      if (u && !seen.has(u.id)) {
        seen.add(u.id)
        ordered.push(u)
      }
    }
    for (const u of users) {
      if (!seen.has(u.id)) {
        seen.add(u.id)
        ordered.push(u)
      }
    }
    // Fall back to a participant's real Clerk profile photo when they have
    // not uploaded an avatar. Only look up the ones missing an upload, and
    // best-effort: a Clerk hiccup must never break the completed-batch page.
    let clerkPhotos = buildClerkPhotoMap([])
    const needPhoto = ordered.filter((u) => !u.avatarUrl)
    if (needPhoto.length > 0) {
      try {
        const clerk = await clerkClient()
        const res = await clerk.users.getUserList({
          userId: needPhoto.map((u) => u.clerkUserId),
          limit: needPhoto.length,
        })
        clerkPhotos = buildClerkPhotoMap(res.data)
      } catch (err) {
        console.error('[batch-page] Clerk avatar lookup failed', err)
      }
    }
    celebrationParticipants = resolveCelebrationParticipants(ordered, clerkPhotos)
  }

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-7xl">
      <EventAnchor />
      {isBatchComplete && celebrationParticipants.length > 0 && (
        <BatchCompletionLap
          batchId={batch.id}
          participants={celebrationParticipants}
        />
      )}

      {batch.deletedAt && (
        <div className="mb-6">
          <RestoreBatchBanner
            batchId={batch.id}
            archivedAt={batch.deletedAt}
            archivedBy={archivedByName}
          />
        </div>
      )}

      <HeroBand
        title={batch.label}
        subtitle={`${client.name} · ${relayStepLabel(batch.currentStep, batch.clientReviewEnabled)} · held by ${batch.holder.name}`}
        breadcrumb={[
          { label: 'My Relay', href: '/dashboard' },
          { label: client.name, href: `/clients/${client.id}` },
          { label: batch.label },
        ]}
      />
      {/* Mobile: one horizontal swipe bar so the actions never stack into
          several rows and eat vertical space. Desktop (sm+): wrap normally. */}
      <div className="mt-5 flex items-center gap-2 overflow-x-auto pb-1 [&>*]:shrink-0 sm:flex-wrap sm:overflow-visible sm:pb-0">
        <Button
          variant="secondary"
          size="sm"
          render={
            <Link
              href={`/clients/${client.id}/batches/${batch.id}/preview`}
              data-testid="batch-preview-link"
            />
          }
        >
          <Eye className="text-muted-foreground" />
          <span>Preview</span>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          render={
            <Link
              href={resolveCanvaUrl(client.canvaUrl)}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
        >
          <Palette className="text-muted-foreground" />
          <span>Open in Canva</span>
          <ExternalLink className="opacity-60" />
        </Button>
        <OpenClientContentButton
          currentStep={batch.currentStep}
          assetsFolderUrl={client.assetsFolderUrl}
        />
        {isLive && canEdit && batch.clientReviewEnabled && (
          <SendLinkButton batchId={batch.id} clientName={client.name} clientReviewEmail={batch.client.clientReviewEmail} />
        )}
        {isLive && canAct && (
          <>
            {batch.currentStep !== RelayStep.final_qa_schedule && (
              <GenerateContentDialog
                clientId={client.id}
                targetMonth={targetMonth}
                lockMonth
              />
            )}
            {run && posts.length > 0 && (
              <ExportButton
                posts={posts.map((p) => ({
                  date: p.postDate.toISOString().split('T')[0],
                  caption: p.caption,
                  hashtags: p.hashtags.join(' '),
                  mediaUrl: p.mediaUrls?.[0] ?? '',
                }))}
                filename={`${client.name}-${targetMonth}`}
              />
            )}
            {canEdit && <ArchiveBatchButton batchId={batch.id} />}
          </>
        )}
      </div>

      <div className="mt-6">
        <ClientTeamHeader
          clientId={client.id}
          clientName={client.name}
          am={
            assignedAm
              ? {
                  id: assignedAm.id,
                  name: assignedAm.name,
                  avatarUrl: assignedAm.avatarUrl,
                }
              : null
          }
          designer={
            assignedDesigner
              ? {
                  id: assignedDesigner.id,
                  name: assignedDesigner.name,
                  avatarUrl: assignedDesigner.avatarUrl,
                }
              : null
          }
          amOptions={amOptions}
          designerOptions={designerOptions}
          canManage={canManageTeam}
        />
      </div>

      <div className="mt-8">
        <RelayTrack
          batch={batchSummary}
          audience={ctx.role === 'client' ? 'client' : 'internal'}
        />
      </div>

      {run?.status === 'failed' && (
        <div className="mt-6">
          <FailedRunBanner
            errorMessage={run.errorMessage}
            errorContext={errorContext}
            failedStep={errorContext?.failedStep ? humanizeFailedStep(errorContext.failedStep) : 'unknown step'}
            pipelineDurationSeconds={Number.isFinite(pipelineDurationSeconds) ? pipelineDurationSeconds : null}
            reRunHref={`/clients/${id}/batches/${batchId}`}
            partialPostCount={posts.length}
          />
        </div>
      )}

      {run && breakdown && canViewCost && (
        <div className="mt-8">
          <CostBreakdown
            breakdown={breakdown}
            pipelineDurationSeconds={Number.isFinite(pipelineDurationSeconds) ? pipelineDurationSeconds : null}
          />
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6 lg:order-1">
          {batch.clientReviewEnabled && magicLinks.length > 0 && (
            <PageSection title={`Review links (${magicLinks.length})`}>
              <div className="space-y-2">
                {magicLinks.map((link) => {
                  // Pre-compute comment count + last-activity per link from
                  // review sessions. "Comment count" counts items that
                  // carry signal: non-null comment, non-null suggestion,
                  // or decision other than not_reviewed.
                  let commentCount = 0
                  let lastActivityAt: Date | null = null
                  for (const session of reviewSessions) {
                    if (session.magicLinkId !== link.id) continue
                    for (const item of session.items) {
                      const hasSignal =
                        Boolean(item.comment) ||
                        Boolean(item.suggestedCaption) ||
                        item.decision !== 'not_reviewed'
                      if (hasSignal) commentCount += 1
                      if (item.reviewedAt) {
                        if (!lastActivityAt || item.reviewedAt > lastActivityAt) {
                          lastActivityAt = item.reviewedAt
                        }
                      }
                    }
                  }
                  return (
                    <MagicLinkRow
                      key={link.id}
                      id={link.id}
                      recipientName={link.defaultReviewerName}
                      recipientEmail={link.defaultReviewerEmail}
                      expiresAt={link.expiresAt}
                      lastVisitedAt={link.lastVisitedAt}
                      commentCount={commentCount}
                      lastActivityAt={lastActivityAt}
                    />
                  )
                })}
              </div>
            </PageSection>
          )}
          {batch.clientReviewEnabled && reviewSessions.length > 0 && (
            <PageSection
              title={`Review Sessions (${reviewSessions.length})`}
              action={(() => {
                const latestSubmitted = reviewSessions.find(
                  (s) => s.status === 'submitted',
                )
                if (!latestSubmitted) return undefined
                return (
                  <Link
                    href={`/clients/${client.id}/batches/${batch.id}/review-sessions/${latestSubmitted.id}`}
                    className="text-[13px] text-foreground underline-offset-4 hover:underline"
                    data-testid="view-client-feedback-header"
                    aria-label="View client feedback"
                  >
                    View client feedback <span aria-hidden="true">→</span>
                  </Link>
                )
              })()}
            >
              <div className="space-y-2">
                {reviewSessions.map((session) => (
                  <ReviewSessionListRow
                    key={session.id}
                    clientId={client.id}
                    batchId={batch.id}
                    sessionId={session.id}
                    reviewerName={session.reviewer?.name ?? 'Anonymous reviewer'}
                    round={session.round}
                    status={session.status}
                    submittedAt={session.submittedAt}
                  />
                ))}
              </div>
            </PageSection>
          )}
          <PostListCollapseProvider postIds={posts.map((p) => p.id)}>
            <PageSection
              title={`Posts (${posts.length})`}
              action={posts.length > 0 ? <PostListExpandAllToggle /> : undefined}
            >
              {posts.length === 0 ? (
                batchSummary.currentStep === 'onboarding_gate' ||
                batchSummary.currentStep === 'copy' ? (
                  <EmptyState
                    title="No posts yet"
                    description="Click Generate content to start."
                    className="py-12"
                  />
                ) : (
                  <EmptyState
                    title="No posts on this relay"
                    description="The relay may predate the content generation, or posts may have been moved to a different relay."
                    className="py-12"
                  />
                )
              ) : (
                <div className="space-y-4">
                  {await Promise.all(
                    posts.map(async (post, idx) => {
                      const versions = await listVersionsForPost(post.id)
                      const versionRows = versions.map((v) => ({
                        id: v.id,
                        caption: v.caption,
                        hashtags: v.hashtags,
                        graphicHook: v.graphicHook,
                        designerNotes: v.designerNotes,
                        createdAt: v.createdAt,
                        authorName: v.author?.name ?? null,
                      }))
                      return (
                        <div
                          key={post.id}
                          data-post-id={post.id}
                          className="space-y-2"
                        >
                          <PostCard
                            post={post}
                            canEdit={canEdit}
                            postNumber={idx + 1}
                            mediaUrl={post.mediaUrls?.[0] ?? null}
                            canUploadMedia={canUploadMedia}
                          />
                          <PostVersionHistory postId={post.id} versions={versionRows} />
                        </div>
                      )
                    }),
                  )}
                </div>
              )}
            </PageSection>
          </PostListCollapseProvider>
        </div>

        <aside
          aria-label="Relay sidebar"
          data-testid="relay-sidebar-rail"
          className="lg:sticky lg:top-4 lg:self-start lg:order-2 lg:max-h-[calc(100dvh-5rem)] lg:overflow-y-auto space-y-4"
        >
          {isClientDecisionView ? (
            <ClientDecisionPanel batch={batchSummary} />
          ) : (
            <>
              {isCopyPreApproved && (
                <CopySubStatePanel
                  batchId={batch.id}
                  clientId={client.id}
                  label={batch.label}
                  subState={batch.currentSubState}
                  canAct={canAct}
                />
              )}
              <ChecklistPanel
                batch={batchSummary}
                items={batch.checklists}
                canAct={canAct}
                legalSendBackTargets={sendBackTargets}
                nextStep={nextStep}
                canForceStep={canForceStep}
                legalForwardTargets={legalForwardTargets}
                clientReviewEmail={batch.client.clientReviewEmail}
                clientName={client.name}
              />
            </>
          )}

          <div
            aria-label="Client thread"
            data-testid="client-thread-rail"
            className="hidden overflow-hidden rounded-2xl bg-card lg:flex lg:h-[36rem] lg:max-h-[calc(100dvh-5rem)] lg:flex-col"
          >
            <h2 className="shrink-0 px-4 pt-4 pb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Client thread
            </h2>
            <div className="min-h-0 flex-1 px-4 pb-4">
              <ActivityThread
                clientId={client.id}
                events={events}
                mentionTargets={mentionTargets}
                hideComposer={!canPostComment || !isLive}
              />
            </div>
          </div>
        </aside>
      </div>
      <MobileThreadFab
        clientId={client.id}
        events={events}
        mentionTargets={mentionTargets}
        hideComposer={!canPostComment || !isLive}
      />
    </div>
  )
}

function ReviewSessionListRow({
  clientId,
  batchId,
  sessionId,
  reviewerName,
  round,
  status,
  submittedAt,
}: {
  clientId: string
  batchId: string
  sessionId: string
  reviewerName: string
  round: number
  status: string
  submittedAt: Date | null
}) {
  const submittedLabel = submittedAt
    ? new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(submittedAt)
    : 'in progress'

  return (
    <div
      data-testid={`review-session-list-row-${sessionId}`}
      className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium truncate">
          {reviewerName}
          <span className="ml-2 text-muted-foreground font-normal">
            Round {round}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          {status === 'submitted'
            ? `Submitted ${submittedLabel}`
            : status === 'in_progress'
              ? 'In progress'
              : 'Superseded'}
        </p>
      </div>
      <Link
        href={`/clients/${clientId}/batches/${batchId}/review-sessions/${sessionId}`}
        className="text-[13px] text-foreground underline-offset-4 hover:underline"
        data-testid={`review-session-open-${sessionId}`}
        aria-label="View client feedback"
      >
        View client feedback <span aria-hidden="true">→</span>
      </Link>
    </div>
  )
}

function humanizeFailedStep(step: string): string {
  switch (step) {
    case 'run_init': return 'run initialization'
    case 'date_calculation': return 'date calculation'
    case 'brief_generation': return 'brief generation'
    case 'website_crawl': return 'website crawl'
    case 'facts_extraction': return 'facts extraction'
    case 'caption_generation': return 'caption generation'
    case 'post_finalization': return 'post finalization'
    default: return step.replace(/_/g, ' ')
  }
}
