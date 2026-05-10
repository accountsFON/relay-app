import { redirect } from 'next/navigation'
import { getOrgContext } from '@/server/middleware/auth'
import { can } from '@/server/auth/permissions'
import {
  listOnboardingQueue,
  listStuckBatches,
} from '@/server/repositories/batches'
import { listFailedRunsForOrg } from '@/server/repositories/contentRuns'
import { listMembershipsForOrg } from '@/server/repositories/memberships'
import { PageHeader } from '@/components/page-header'
import { PageSection } from '@/components/ui/page-section'
import { EmptyState } from '@/components/ui/empty-state'
import { AdminTabs } from './admin-tabs'
import { OnboardingQueueRow } from './onboarding-queue-row'
import { StuckBatchRow } from './stuck-batch-row'
import { FailedRunRow } from './failed-run-row'

export default async function AdminDashboardPage() {
  const ctx = await getOrgContext()
  if (!ctx || !can(ctx, 'admin.portal')) redirect('/no-access')

  const [onboardingQueue, stuckBatches, failedRuns, memberships] = await Promise.all([
    listOnboardingQueue(ctx.organizationDbId),
    listStuckBatches(ctx.organizationDbId, 48),
    listFailedRunsForOrg(ctx.organizationDbId, { limit: 10 }),
    listMembershipsForOrg(ctx.organizationDbId),
  ])

  const ams = memberships
    .filter((m) => m.role === 'account_manager')
    .map((m) => ({ id: m.user.id, name: m.user.name }))
  const designers = memberships
    .filter((m) => m.role === 'designer')
    .map((m) => ({ id: m.user.id, name: m.user.name }))

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-5xl">
      <PageHeader
        title="Admin"
        description="Onboarding queue, stuck batch watchlist, and failed runs."
      />

      <div className="mt-6">
        <AdminTabs />
      </div>

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
                  <StuckBatchRow batch={batch} ams={ams} designers={designers} />
                </li>
              ))}
            </ul>
          )}
        </PageSection>

        <PageSection
          title={`Failed runs · ${failedRuns.length}`}
          description="Recent content generation runs that failed before completion. Click to inspect the error and any partial output."
        >
          {failedRuns.length === 0 ? (
            <EmptyState
              title="No failed runs"
              description="Every recent generation run has succeeded."
            />
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border bg-background">
              {failedRuns.map((run) => (
                <li key={run.id}>
                  <FailedRunRow run={run} />
                </li>
              ))}
            </ul>
          )}
        </PageSection>
      </div>
    </div>
  )
}
