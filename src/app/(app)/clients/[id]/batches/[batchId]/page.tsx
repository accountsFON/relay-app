import { notFound } from 'next/navigation'
import { RelayStep } from '@prisma/client'
import { requireClientViewer } from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import { findBatch } from '@/server/repositories/batches'
import { listActivityForClient } from '@/server/repositories/activityEvents'
import {
  legalNextSteps,
  legalSendBackTargets,
} from '@/server/lib/relay-state-machine'
import { PageHeader } from '@/components/page-header'
import { PageSection } from '@/components/ui/page-section'
import { RelayTrack } from '@/components/relay/relay-track'
import { ChecklistPanel } from '@/components/relay/checklist-panel'
import { ActivityThread } from '@/components/activity/activity-thread'
import { STEP_LABEL } from '@/components/relay/labels'

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ id: string; batchId: string }>
}) {
  const ctx = await requireClientViewer()
  const { id, batchId } = await params

  const client = await findClientForUser(ctx, id)
  if (!client) notFound()

  const batch = await findBatch(batchId)
  if (!batch || batch.clientId !== client.id) notFound()

  const events = await listActivityForClient(client.id, { limit: 30 })

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

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-6xl">
      <PageHeader
        title={`Batch ${batch.label}`}
        description={`${client.name} · ${STEP_LABEL[batch.currentStep]} · held by ${batch.holder.name}`}
        backHref={`/clients/${id}`}
        backLabel={`Back to ${client.name}`}
      />

      <div className="mt-8">
        <RelayTrack batch={batchSummary} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <PageSection title="Posts">
            <p className="text-sm text-muted-foreground">
              Posts grid will render here. Run-aware view migrating from
              ContentRun in a follow-up.
            </p>
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
          {isRevisionsStep ? (
            <PageSection title="Revision plan">
              <p className="text-sm text-muted-foreground">
                Revision plan composer goes here (RevisionPlanComposer).
              </p>
            </PageSection>
          ) : (
            <ChecklistPanel
              batch={batchSummary}
              items={batch.checklists}
              canAct={canAct}
              legalSendBackTargets={sendBackTargets}
              nextStep={nextStep}
            />
          )}
        </div>
      </div>
    </div>
  )
}
