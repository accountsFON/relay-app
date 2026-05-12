import { notFound } from 'next/navigation'
import { RelayStep } from '@prisma/client'
import { requireClientViewer, canEditClients } from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import { findBatch } from '@/server/repositories/batches'
import {
  listActivityForClient,
  visibilityForViewer,
} from '@/server/repositories/activityEvents'
import { db } from '@/db/client'
import {
  legalNextSteps,
  legalSendBackTargets,
} from '@/server/lib/relay-state-machine'
import { PageHeader } from '@/components/page-header'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { PageSection } from '@/components/ui/page-section'
import { RelayTrack } from '@/components/relay/relay-track'
import { ChecklistPanel } from '@/components/relay/checklist-panel'
import { ClientDecisionPanel } from '@/components/relay/client-decision-panel'
import { CopySubStatePanel } from '@/components/relay/copy-substate-panel'
import { RevisionPlanComposer } from '@/components/relay/revision-plan-composer'
import { ActivityThread } from '@/components/activity/activity-thread'
import { STEP_LABEL } from '@/components/relay/labels'
import { passBaton } from '@/server/services/relay'
import { parseDateScope } from '@/lib/date-scope'
import { findRunForBatch } from '@/server/repositories/contentRuns'
import { listVersionsForPost } from '@/server/services/postVersions'
import { resolveBatchTargetMonth } from '@/lib/batch-target-month'
import { PostCard } from '@/components/posts/post-card'
import { PostVersionHistory } from '@/components/posts/post-version-history'
import { CostBreakdown } from '@/components/runs/cost-breakdown'
import { FailedRunBanner } from '@/components/runs/failed-run-banner'
import { ExportButton } from '@/components/runs/export-button'
import { GenerateContentDialog } from '@/components/relay/generate-content-dialog'
import { ArchiveBatchButton } from '@/components/relay/archive-batch-button'
import { RestoreBatchBanner } from '@/components/relay/restore-batch-button'
import { ShowArchivedToggle } from '@/components/relay/show-archived-toggle'
import { MissingClientUserBanner } from '@/components/relay/missing-client-user-banner'

export default async function BatchDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; batchId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireClientViewer()
  const canEdit = canEditClients(ctx)
  const { id, batchId } = await params
  const sp = await searchParams
  const dateScope = parseDateScope({
    scope: typeof sp.scope === 'string' ? sp.scope : null,
    from: typeof sp.from === 'string' ? sp.from : null,
    to: typeof sp.to === 'string' ? sp.to : null,
  })
  const showArchived = sp.archived === '1'

  const client = await findClientForUser(ctx, id)
  if (!client) notFound()

  // findBatch now uses withArchived() so archived batches still load.
  let batch = await findBatch(batchId)
  if (!batch || batch.clientId !== client.id) notFound()

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

  // Posts query: include archived posts when ?archived=1 is set.
  // The batch itself being archived does NOT automatically show archived posts —
  // the toggle remains the user's explicit control.
  const postQuery = showArchived ? db.post.withArchived() : db.post

  const [events, posts, archivedCount] = await Promise.all([
    listActivityForClient(client.id, {
      limit: 30,
      visibilityFilter: visibilityForViewer(ctx),
      dateRange: { from: dateScope.from, to: dateScope.to },
    }),
    postQuery.findMany({
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
      },
    }),
    db.post.onlyArchived().count({ where: { batchId: batch.id } }),
  ])

  const sendBackTargets = legalSendBackTargets(batch.currentStep).map((step) => ({
    step,
    label: STEP_LABEL[step],
  }))
  const forwardTransitions = legalNextSteps(batch.currentStep).filter(
    (t) => t.direction === 'forward' || t.direction === 'auto',
  )
  const nextStep =
    forwardTransitions.length === 1 ? forwardTransitions[0].to : undefined

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
    holder: {
      id: batch.holder.id,
      name: batch.holder.name,
    },
    daysOnCurrentStep,
  }

  const canAct = batch.currentHolder === ctx.userDbId || ctx.platformOwner
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

  const isRevisionsStep = batch.currentStep === RelayStep.implementing_revisions
  const isClientDecisionView =
    ctx.role === 'client' &&
    batch.currentStep === RelayStep.client_decision &&
    canAct
  const isCopyPreApproved =
    batch.currentStep === RelayStep.copy &&
    (batch.currentSubState ?? 'generating') !== 'approved'

  // sent_to_client (UI step 8) and client_decision (UI step 9) both expect a
  // real client viewer to advance the batch (auto on 8 → 9, manual approve on
  // 9 → 10). If no client user is linked, resolveHolderForStep silently falls
  // the holder back to the AM/admin and the batch sits on whichever step it
  // landed on. Surface a banner so the holder can advance manually on either.
  const hasLinkedClientUser =
    (batch.client._count?.linkedClientUsers ?? 0) > 0
  const isClientHeldStep =
    batch.currentStep === RelayStep.sent_to_client ||
    batch.currentStep === RelayStep.client_decision
  const showMissingClientUserBanner =
    isLive && isClientHeldStep && !hasLinkedClientUser && canAct

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-6xl">
      {batch.deletedAt && (
        <div className="mb-6">
          <RestoreBatchBanner
            batchId={batch.id}
            archivedAt={batch.deletedAt}
            archivedBy={archivedByName}
          />
        </div>
      )}

      <div className="mb-5">
        <Breadcrumbs
          items={[
            { href: '/dashboard', label: 'Dashboard' },
            { href: `/clients/${client.id}`, label: client.name },
            { label: `Batch ${batch.label}` },
          ]}
        />
      </div>

      <PageHeader
        title={`Batch ${batch.label}`}
        description={`${client.name} · ${STEP_LABEL[batch.currentStep]} · held by ${batch.holder.name}`}
        actions={
          isLive && canAct ? (
            <>
              {batch.currentStep !== RelayStep.final_qa_schedule && (
                <GenerateContentDialog
                  clientId={client.id}
                  clientName={client.name}
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
                    graphicHook: p.graphicHook ?? '',
                    designerNotes: p.designerNotes ?? '',
                  }))}
                  filename={`${client.name}-${targetMonth}`}
                />
              )}
              {canEdit && <ArchiveBatchButton batchId={batch.id} />}
            </>
          ) : undefined
        }
      />

      <div className="mt-8">
        <RelayTrack
          batch={batchSummary}
          audience={ctx.role === 'client' ? 'client' : 'internal'}
        />
      </div>

      {showMissingClientUserBanner && (
        <div className="mt-6">
          <MissingClientUserBanner
            batchId={batch.id}
            clientName={client.name}
            currentStep={batch.currentStep as typeof RelayStep.sent_to_client | typeof RelayStep.client_decision}
          />
        </div>
      )}

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

      {run && breakdown && (
        <div className="mt-8">
          <CostBreakdown
            breakdown={breakdown}
            pipelineDurationSeconds={Number.isFinite(pipelineDurationSeconds) ? pipelineDurationSeconds : null}
          />
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <PageSection
            title={`Posts (${posts.length})`}
            action={<ShowArchivedToggle countArchived={archivedCount} />}
          >
            {posts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {batchSummary.currentStep === 'onboarding_gate' ||
                batchSummary.currentStep === 'copy'
                  ? 'No posts yet. Click Generate content to start.'
                  : 'No posts on this batch. The batch may pre-date the content run, or posts may have been moved to a different batch.'}
              </p>
            ) : (
              <div className="space-y-4">
                {await Promise.all(
                  posts.map(async (post) => {
                    const versions = await listVersionsForPost(post.id)
                    const versionRows = versions.map((v) => ({
                      id: v.id,
                      caption: v.caption,
                      hashtagCount: v.hashtags.length,
                      createdAt: v.createdAt,
                      authorName: v.author?.name ?? null,
                    }))
                    return (
                      <div key={post.id} className="space-y-2">
                        <PostCard post={post} canEdit={canEdit} />
                        <PostVersionHistory postId={post.id} versions={versionRows} />
                      </div>
                    )
                  }),
                )}
              </div>
            )}
          </PageSection>

          <PageSection title="Activity">
            <ActivityThread
              clientId={client.id}
              events={events}
              hideComposer
            />
          </PageSection>
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start space-y-4">
          {isClientDecisionView ? (
            <ClientDecisionPanel batch={batchSummary} />
          ) : isRevisionsStep ? (
            <RevisionPlanComposer
              batch={batchSummary}
              assignedAmId={client.assignedAmId}
              assignedDesignerId={client.assignedDesignerId}
              meId={ctx.userDbId}
            />
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
              />
            </>
          )}
        </div>
      </div>
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
