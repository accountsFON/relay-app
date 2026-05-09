/**
 * /admin — Admin two-stack dashboard.
 *
 * Spec: projects/relay-app/2026-05-09-relay-workflow-design.md § UI Direction
 *       (Admin: two-stack dashboard with Onboarding Queue + Stuck Watchlist)
 *
 * Behavior (V1):
 * - Stack 1: Onboarding Queue. Clients where Client.onboardingCompletedAt is null.
 * - Stack 2: Stuck Watchlist. Batches idle > 48h on their current step.
 * - Each row: client + batch label + holder + days-stuck + Nudge / Take-over buttons.
 *
 * Phase: skeleton now. Phase 3 wires:
 *   - listOnboardingQueue (Rails or Caleb repo)
 *   - listStuckBatches (Rails repo, with > 48h cutoff)
 *   - nudgeAction / takeOverAction (Rails-owned)
 *
 * Schema dep: Batch.daysOnCurrentStep computed field, Client.onboardingCompletedAt.
 */
import { requireAdminPortal } from '@/server/middleware/permissions'
import { PageHeader } from '@/components/page-header'
import { PageSection } from '@/components/ui/page-section'
import { EmptyState } from '@/components/ui/empty-state'

export default async function AdminDashboardPage() {
  await requireAdminPortal()

  // TODO Phase 3:
  // const [onboardingQueue, stuckBatches] = await Promise.all([
  //   listOnboardingQueue(ctx.organizationDbId),
  //   listStuckBatches(ctx.organizationDbId, { hoursIdle: 48 }),
  // ])
  const onboardingQueue: never[] = []
  const stuckBatches: never[] = []

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-5xl">
      <PageHeader
        title="Admin"
        description="Onboarding queue + stuck batch watchlist."
      />

      <div className="mt-10 space-y-8">
        <PageSection
          title={`Onboarding queue · ${onboardingQueue.length}`}
          description="Clients waiting on you to finish onboarding before their first batch can start."
        >
          {onboardingQueue.length === 0 ? (
            <EmptyState
              title="Queue is clear"
              description="Every client has finished onboarding. New imports show up here."
            />
          ) : (
            // TODO Phase 3: render queue rows
            <p className="text-sm text-muted-foreground">TODO: queue rows</p>
          )}
        </PageSection>

        <PageSection
          title={`Stuck watchlist · ${stuckBatches.length}`}
          description="Batches idle on the same step for more than 48 hours. Nudge the holder, or take over."
        >
          {stuckBatches.length === 0 ? (
            <EmptyState
              title="Nothing's stuck"
              description="Every active batch is moving. Anything idle 48+ hours surfaces here automatically."
            />
          ) : (
            // TODO Phase 3: render stuck rows with Nudge / Take-over actions
            <p className="text-sm text-muted-foreground">TODO: stuck rows</p>
          )}
        </PageSection>
      </div>
    </div>
  )
}
