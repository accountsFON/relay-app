import Link from 'next/link'
import { requireAdminPortal } from '@/server/middleware/permissions'
import { listClientsByOrgWithAssignments } from '@/server/repositories/clients'
import { listUsersByOrg } from '@/server/repositories/users'
import { Card } from '@/components/ui/card'
import { AssignmentSelect } from './assignment-select'

export default async function AdminClientsPage() {
  const ctx = await requireAdminPortal()

  const [clients, users] = await Promise.all([
    listClientsByOrgWithAssignments(ctx.organizationDbId),
    listUsersByOrg(ctx.organizationDbId),
  ])

  const ams = users
    .filter((u) => u.role === 'account_manager')
    .map((u) => ({ id: u.id, name: u.name }))
  const designers = users
    .filter((u) => u.role === 'designer')
    .map((u) => ({ id: u.id, name: u.name }))

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <div className="mb-4">
        <Link
          href="/admin/users"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to team
        </Link>
      </div>

      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">
          Clients
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {clients.length} {clients.length === 1 ? 'client' : 'clients'}. Reassign
          AM and Designer per client below.
        </p>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2">Client</th>
                <th className="px-4 py-2">Industry</th>
                <th className="px-4 py-2">AM</th>
                <th className="px-4 py-2">Designer</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{c.name}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.industry ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <AssignmentSelect
                      clientId={c.id}
                      slot="am"
                      currentUserId={c.assignedAm?.id ?? null}
                      options={ams}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <AssignmentSelect
                      clientId={c.id}
                      slot="designer"
                      currentUserId={c.assignedDesigner?.id ?? null}
                      options={designers}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {clients.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No clients yet.
          </div>
        )}
      </Card>
    </div>
  )
}
