import { requireOrgContext } from '@/server/middleware/auth'
import { getMonthlyCostSummary } from '@/server/repositories/contentRuns'
import { Card } from '@/components/ui/card'

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

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">Role: {ctx.role}</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 md:mt-8 md:gap-4 md:grid-cols-3">
        <Card className="p-4 md:p-6">
          <p className="text-sm text-muted-foreground">{monthLabel} Cost</p>
          <p className="text-2xl font-bold text-foreground mt-1 md:text-3xl">
            ${costSummary.totalCostUsd.toFixed(2)}
          </p>
        </Card>
        <Card className="p-4 md:p-6">
          <p className="text-sm text-muted-foreground">{monthLabel} Runs</p>
          <p className="text-2xl font-bold text-foreground mt-1 md:text-3xl">
            {costSummary.totalRuns}
          </p>
        </Card>
        <Card className="p-4 md:p-6">
          <p className="text-sm text-muted-foreground">Avg Cost / Run</p>
          <p className="text-2xl font-bold text-foreground mt-1 md:text-3xl">
            $
            {costSummary.totalRuns > 0
              ? (costSummary.totalCostUsd / costSummary.totalRuns).toFixed(2)
              : '0.00'}
          </p>
        </Card>
      </div>

      {costSummary.byClient.length > 0 && (
        <div className="mt-6 md:mt-8">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Cost by Client
          </h2>
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                    Client
                  </th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">
                    Runs
                  </th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">
                    Cost
                  </th>
                </tr>
              </thead>
              <tbody>
                {costSummary.byClient.map((c) => (
                  <tr key={c.name} className="border-t border-border">
                    <td className="px-4 py-2">{c.name}</td>
                    <td className="px-4 py-2 text-right">{c.runs}</td>
                    <td className="px-4 py-2 text-right">
                      ${c.cost.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {costSummary.byClient.length === 0 && (
        <div className="mt-6 md:mt-8 rounded-lg border border-border bg-card p-6 md:p-8 text-center text-muted-foreground">
          No completed runs this month. Generate content for a client to see cost tracking here.
        </div>
      )}
    </div>
  )
}
