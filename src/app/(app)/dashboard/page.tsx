import { requireOrgContext } from '@/server/middleware/auth'

export default async function DashboardPage() {
  const ctx = await requireOrgContext()

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">
        Role: {ctx.role}
      </p>
      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-400">
        Client list and run statuses will appear here (Plan 2).
      </div>
    </div>
  )
}
