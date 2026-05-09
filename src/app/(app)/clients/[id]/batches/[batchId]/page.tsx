/**
 * /clients/[id]/batches/[batchId] — batch detail page.
 *
 * Spec: projects/relay-app/2026-05-09-relay-workflow-design.md § UI Direction
 *       (the relay-track hero, posts grid, checklist right rail, activity excerpt)
 *
 * Layout (V1):
 *   ┌──────────────────────────────────────────────────────┐
 *   │ PageHeader: batch label + back to client            │
 *   │                                                      │
 *   │ <RelayTrack> ── sticky on scroll                     │
 *   │                                                      │
 *   │ ┌─────────────────────┬──────────────────────────┐   │
 *   │ │ Posts grid          │ ChecklistPanel (sticky)  │   │
 *   │ │  -or-               │  -or-                    │   │
 *   │ │ ActivityThread      │ RevisionPlanComposer (11b)│  │
 *   │ │ excerpt below       │                          │   │
 *   │ └─────────────────────┴──────────────────────────┘   │
 *   └──────────────────────────────────────────────────────┘
 *
 * Phase: shell now. Phase 3 wires:
 *   - findBatchById (Rails-owned repo)
 *   - listChecklistItemsForBatch
 *   - listActivityForClient (filtered to this batchId in payload)
 *   - validateTransition() to compute legal Send-Back targets + nextStep
 *   - PostsGrid component (currently exists for ContentRun, may need
 *     a Batch variant or migration)
 *
 * Schema dep: Batch, ChecklistItem, RelayEvent, ActivityEvent (Rails-owned).
 */
import { notFound } from 'next/navigation'
import { requireClientViewer } from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import { PageHeader } from '@/components/page-header'
import { PageSection } from '@/components/ui/page-section'
import { EmptyState } from '@/components/ui/empty-state'
// Components scaffolded for this page — wired up in Phase 3.
// import { RelayTrack } from '@/components/relay/relay-track'
// import { ChecklistPanel } from '@/components/relay/checklist-panel'
// import { RevisionPlanComposer } from '@/components/relay/revision-plan-composer'
// import { ActivityThread } from '@/components/activity/activity-thread'

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ id: string; batchId: string }>
}) {
  const ctx = await requireClientViewer()
  const { id, batchId } = await params

  const client = await findClientForUser(ctx, id)
  if (!client) notFound()

  // TODO Phase 3: const batch = await findBatchById(batchId)
  // if (!batch || batch.clientId !== client.id) notFound()
  // const items = await listChecklistItemsForBatch(batchId, batch.currentStep)
  // const events = await listActivityForClient(client.id, 30)
  // const { legalSendBackTargets, nextStep } = computeTransitions(batch.currentStep)

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-6xl">
      <PageHeader
        title={`Batch ${batchId}`}
        description={`${client.name} · TODO Phase 3: render relay-track, posts grid, checklist`}
        backHref={`/clients/${id}`}
        backLabel={`Back to ${client.name}`}
      />

      <div className="mt-10 space-y-6">
        <PageSection title="Relay">
          <EmptyState
            title="Batch detail wires here"
            description="Phase 3 plugs in <RelayTrack>, the posts grid, <ChecklistPanel>, <RevisionPlanComposer> for step 11b, and the activity excerpt."
          />
        </PageSection>
      </div>
    </div>
  )
}
