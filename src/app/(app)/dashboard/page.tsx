import { requireOrgContext } from '@/server/middleware/auth'
import { getMonthlyCostSummary } from '@/server/repositories/contentRuns'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/page-header'
import { PageSection } from '@/components/ui/page-section'
import { EmptyState } from '@/components/ui/empty-state'
import { DataRow, DataRowGroup, RowAvatar } from '@/components/ui/data-row'

export default async function DashboardPage() {
  const ctx = await requireOrgContext()

  let costSummary = { totalCostUsd: 0, totalRuns: 0, byClient: [] as { name: string; cost: number; runs: number }[] }
  try {
    costSummary = await getMonthlyCostSummary(ctx.organizationDbId)
  } catch {
    // DB query may fail if schema hasn't been pushed or connection issues
  }

  const monthLabel = new Date().toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  const avgCost =
    costSummary.totalRuns > 0
      ? costSummary.totalCostUsd / costSummary.totalRuns
      : 0

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-6xl">
      <PageHeader
        title="Dashboard"
        description={`Activity for ${monthLabel}.`}
      />

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        <StatCard label={`${monthLabel} cost`} value={`$${costSummary.totalCostUsd.toFixed(2)}`} />
        <StatCard label={`${monthLabel} runs`} value={costSummary.totalRuns.toLocaleString()} />
        <StatCard label="Avg cost / run" value={`$${avgCost.toFixed(2)}`} />
      </div>

      <div className="mt-10">
        {costSummary.byClient.length > 0 ? (
          <PageSection title="Cost by client">
            <DataRowGroup className="-mx-1">
              {costSummary.byClient.map((c) => (
                <DataRow
                  key={c.name}
                  leading={<RowAvatar initials={c.name.slice(0, 2)} />}
                  title={c.name}
                  subtitle={`${c.runs} ${c.runs === 1 ? 'run' : 'runs'}`}
                  meta={`$${c.cost.toFixed(4)}`}
                />
              ))}
            </DataRowGroup>
          </PageSection>
        ) : (
          <EmptyState
            title="Nothing's shipped yet."
            description="Generate content for a client and cost tracking will start showing up here."
          />
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <div className="px-5">
        <p className="text-[13px] text-muted-foreground">{label}</p>
        <p className="mt-2 text-3xl font-bold text-foreground tabular-nums tracking-[-0.5px]">
          {value}
        </p>
      </div>
    </Card>
  )
}
