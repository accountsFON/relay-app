import { redirect } from 'next/navigation'
import { getOrgContext } from '@/server/middleware/auth'
import { can } from '@/server/auth/permissions'
import {
  listOnboardingQueue,
  listStuckBatches,
} from '@/server/repositories/batches'
import { PageHeader } from '@/components/page-header'
import { PageSection } from '@/components/ui/page-section'
import { EmptyState } from '@/components/ui/empty-state'
import { OnboardingQueueRow } from './onboarding-queue-row'
import { StuckBatchRow } from './stuck-batch-row'

export default async function AdminDashboardPage() {
  const ctx = await getOrgContext()
  if (!ctx || !can(ctx, 'admin.portal')) redirect('/no-access')

  const [onboardingQueue, stuckBatches] = await Promise.all([
    listOnboardingQueue(ctx.organizationDbId),
    listStuckBatches(ctx.organizationDbId, 48),
  ])

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
              description="Every client has finished onboarding."
            />
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border bg-background">
              {onboardingQueue.map((row) => (
                <li key={row.id}>
                  <OnboardingQueueRow client={row} />
                </li>
              ))}
            </ul>
          )}
        </PageSection>

        <PageSection
          title={`Stuck watchlist · ${stuckBatches.length}`}
          description="Batches idle on the same step for more than 48 hours."
        >
          {stuckBatches.length === 0 ? (
            <EmptyState
              title="Nothing's stuck"
              description="Every active batch is moving."
            />
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border bg-background">
              {stuckBatches.map((batch) => (
                <li key={batch.id}>
                  <StuckBatchRow batch={batch} />
                </li>
              ))}
            </ul>
          )}
        </PageSection>
      </div>
    </div>
  )
}
