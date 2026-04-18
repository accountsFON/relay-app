import Link from 'next/link'
import {
  requireClientViewer,
  canEditClients,
} from '@/server/middleware/permissions'
import { listClientsByOrg } from '@/server/repositories/clients'
import { BulkGenerateList } from './bulk-generate'
import { Button } from '@/components/ui/button'

export default async function ClientsPage() {
  const ctx = await requireClientViewer()
  const clients = await listClientsByOrg(ctx.organizationDbId)

  const canCreate = canEditClients(ctx.role)

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">
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
        <div className="rounded-lg border border-dashed border-border bg-card p-8 sm:p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No clients yet.
            {canCreate && ' Click "New client" to add your first one.'}
          </p>
        </div>
      ) : (
        <BulkGenerateList
          clients={clients.map((c) => ({
            id: c.id,
            name: c.name,
            status: c.status,
            industry: c.industry,
          }))}
        />
      )}
    </div>
  )
}
