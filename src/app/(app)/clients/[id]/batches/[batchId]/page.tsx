import Link from 'next/link'
import { notFound } from 'next/navigation'
import { RelayStep } from '@prisma/client'
import { requireClientViewer } from '@/server/middleware/permissions'
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

export default async function BatchDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; batchId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireClientViewer()
  const { id, batchId } = await params
  const sp = await searchParams
  const dateScope = parseDateScope({
    scope: typeof sp.scope === 'string' ? sp.scope : null,
    from: typeof sp.from === 'string' ? sp.from : null,
    to: typeof sp.to === 'string' ? sp.to : null,
  })

  const client = await findClientForUser(ctx, id)
  if (!client) notFound()

  let batch = await findBatch(batchId)
  if (!batch || batch.clientId !== client.id) notFound()

  // Spec § Verification step 9: client opening at sent_to_client auto-advances
  // to client_decision. Best-effort; failure logs and renders prior step.
  if (
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

  const [events, posts] = await Promise.all([
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
        contentRunId: true,
      },
    }),
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

  const isRevisionsStep = batch.currentStep === RelayStep.implementing_revisions
  const isClientDecisionView =
    ctx.role === 'client' &&
    batch.currentStep === RelayStep.client_decision &&
    canAct
  const isCopyPreApproved =
    batch.currentStep === RelayStep.copy &&
    (batch.currentSubState ?? 'generating') !== 'approved'

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-6xl">
      <PageHeader
        title={`Batch ${batch.label}`}
        description={`${client.name} · ${STEP_LABEL[batch.currentStep]} · held by ${batch.holder.name}`}
        backHref={`/clients/${id}`}
        backLabel={`Back to ${client.name}`}
      />

      <div className="mt-8">
        <RelayTrack
          batch={batchSummary}
          audience={ctx.role === 'client' ? 'client' : 'internal'}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <PageSection title={`Posts (${posts.length})`}>
            {posts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No posts attached to this batch yet. Generated posts attach
                automatically once a content run finishes for this month.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border bg-card">
                {posts.map((post) => (
                  <li key={post.id} className="px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[12px] font-mono text-muted-foreground">
                        {formatPostDate(post.postDate)}
                      </p>
                      <Link
                        href={`/clients/${client.id}/runs/${post.contentRunId}`}
                        className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                      >
                        edit →
                      </Link>
                    </div>
                    <p className="mt-1.5 text-[13px] text-foreground line-clamp-3 whitespace-pre-wrap">
                      {post.caption}
                    </p>
                    {post.hashtags.length > 0 && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {post.hashtags.slice(0, 8).map((h) => `#${h}`).join(' ')}
                        {post.hashtags.length > 8 && ` +${post.hashtags.length - 8} more`}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
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

function formatPostDate(d: Date): string {
  return new Date(d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}
