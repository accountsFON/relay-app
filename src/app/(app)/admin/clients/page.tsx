import { requireAdminPortal } from '@/server/middleware/permissions'
import { listClientsByOrgWithAssignments } from '@/server/repositories/clients'
import { listMembershipsForOrg } from '@/server/repositories/memberships'
import { Card } from '@/components/ui/card'
import { HeroBand } from '@/components/hero-band'
import { AdminTabs } from '../admin-tabs'
import { AssignmentSelect } from './assignment-select'

export default async function AdminClientsPage() {
  const ctx = await requireAdminPortal()

  const [clients, memberships] = await Promise.all([
    listClientsByOrgWithAssignments(ctx.organizationDbId),
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
      <HeroBand
        title="Client assignments"
        subtitle={`${clients.length} ${clients.length === 1 ? 'client' : 'clients'}. Reassign AM and Designer per client below.`}
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'Client assignments' },
        ]}
      />

      <div className="mt-6">
        <AdminTabs />
      </div>

      <Card className="mt-10">
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
                      clientName={c.name}
                      slot="am"
                      currentUserId={c.assignedAm?.id ?? null}
                      options={ams}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <AssignmentSelect
                      clientId={c.id}
                      clientName={c.name}
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
