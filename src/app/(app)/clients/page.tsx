import Link from 'next/link'
import {
  requireClientViewer,
  canEditClients,
} from '@/server/middleware/permissions'
import { listClientsByOrg } from '@/server/repositories/clients'
import { ClientListItem } from '@/components/clients/client-list-item'
import { Button } from '@/components/ui/button'

export default async function ClientsPage() {
  const ctx = await requireClientViewer()
  const clients = await listClientsByOrg(ctx.organizationDbId)

  const canCreate = canEditClients(ctx.role)

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="mt-1 text-sm text-slate-500">
            {clients.length} {clients.length === 1 ? 'client' : 'clients'}
          </p>
        </div>
        {canCreate && (
          <Link href="/clients/new">
            <Button>New client</Button>
          </Link>
        )}
      </div>

      {clients.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-sm text-slate-500">
            No clients yet.
            {canCreate && ' Click "New client" to add your first one.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {clients.map((client) => (
            <ClientListItem key={client.id} client={client} />
          ))}
        </div>
      )}
    </div>
  )
}
