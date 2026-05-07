import Link from 'next/link'
import {
  requireClientViewer,
  canEditClients,
} from '@/server/middleware/permissions'
import { listClientsForUser } from '@/server/repositories/clients'
import { BulkGenerateList } from './bulk-generate'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/ui/empty-state'

export default async function ClientsPage() {
  const ctx = await requireClientViewer()
  const clients = await listClientsForUser(ctx)

  const canCreate = canEditClients(ctx)

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-5xl">
      <PageHeader
        title="Clients"
        description={`${clients.length} ${clients.length === 1 ? 'client' : 'clients'} in this workspace.`}
        actions={
          canCreate && (
            <Link href="/clients/new">
              <Button variant="accent">New client</Button>
            </Link>
          )
        }
      />

      <div className="mt-10">
        {clients.length === 0 ? (
          <EmptyState
            title="No clients here yet."
            description="Add a brand and Relay can start drafting their content."
            action={
              canCreate && (
                <Link href="/clients/new">
                  <Button variant="accent" size="lg">Add your first client</Button>
                </Link>
              )
            }
          />
        ) : (
          <BulkGenerateList
            clients={clients.map((c) => ({
              id: c.id,
              name: c.name,
              status: c.status,
              industry: c.industry,
              location: c.location,
            }))}
          />
        )}
      </div>
    </div>
  )
}
