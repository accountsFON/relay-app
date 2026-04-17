import { requireOrgContext } from '@/server/middleware/auth'
import { getMonthlyCostSummary } from '@/server/repositories/contentRuns'
import { Card } from '@/components/ui/card'

export default async function DashboardPage() {
  const ctx = await requireOrgContext()
  const costSummary = await getMonthlyCostSummary(ctx.organizationDbId)

  const monthLabel = new Date().toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">Role: {ctx.role}</p>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Card className="p-6">
          <p className="text-sm text-slate-500">{monthLabel} Cost</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">
            ${costSummary.totalCostUsd.toFixed(2)}
          </p>
        </Card>
        <Card className="p-6">
          <p className="text-sm text-slate-500">{monthLabel} Runs</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">
            {costSummary.totalRuns}
          </p>
        </Card>
        <Card className="p-6">
          <p className="text-sm text-slate-500">Avg Cost / Run</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">
            $
            {costSummary.totalRuns > 0
              ? (costSummary.totalCostUsd / costSummary.totalRuns).toFixed(2)
              : '0.00'}
          </p>
        </Card>
      </div>

      {costSummary.byClient.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Cost by Client
          </h2>
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-slate-600">
                    Client
                  </th>
                  <th className="text-right px-4 py-2 font-medium text-slate-600">
                    Runs
                  </th>
                  <th className="text-right px-4 py-2 font-medium text-slate-600">
                    Cost
                  </th>
                </tr>
              </thead>
              <tbody>
                {costSummary.byClient.map((c) => (
                  <tr key={c.name} className="border-t border-slate-100">
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
        <div className="mt-8 rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-400">
          No completed runs this month. Generate content for a client to see cost tracking here.
        </div>
      )}
    </div>
  )
}
