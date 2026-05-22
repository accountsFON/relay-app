import Link from 'next/link'
import {
  requireClientViewer,
  canEditClients,
} from '@/server/middleware/permissions'
import { listClientsForUser } from '@/server/repositories/clients'
import { db } from '@/db/client'
import { BulkGenerateList } from './bulk-generate'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { ShowArchivedToggle } from '@/components/relay/show-archived-toggle'
import { getClientScopeFilter } from '@/server/auth/scope'
import { sortClientsForAm } from '@/lib/client-am-sort'

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireClientViewer()
  const sp = await searchParams
  const showArchived = sp?.archived === '1'

  const [clientsUnsorted, archivedClientCount] = await Promise.all([
    listClientsForUser(ctx, { showArchived }),
    db.client.onlyArchived().count({
      where: {
        organizationId: ctx.organizationDbId,
        ...getClientScopeFilter(ctx),
      },
    }),
  ])

  // AM default sort: Ready -> Onboarding -> Paused -> Archived, alphabetical
  // within rank. Other roles keep the repository's name-asc ordering so admin /
  // designer / client surfaces look unchanged. Phase 2 item 12.
  const clients =
    ctx.role === 'account_manager'
      ? sortClientsForAm(clientsUnsorted)
      : clientsUnsorted

  const canCreate = canEditClients(ctx)

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-5xl">
      <PageHeader
        title="Clients"
        description={`${clients.length} ${clients.length === 1 ? 'client' : 'clients'} in this workspace.`}
        actions={
          canCreate && (
            <>
              <Link href="/clients/new">
                <Button variant="accent">New client</Button>
              </Link>
              <Link href="/clients/import">
                <Button variant="outline">Import CSV</Button>
              </Link>
            </>
          )
        }
      />

      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <ShowArchivedToggle countArchived={archivedClientCount} />
        </div>

        {clients.length === 0 ? (
          <EmptyState
            title={showArchived ? 'No archived clients.' : 'No clients here yet.'}
            description={
              showArchived
                ? 'No archived clients found in this workspace.'
                : 'Add a brand and Relay can start drafting their content.'
            }
            action={
              !showArchived && canCreate && (
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
              isArchived: Boolean(c.deletedAt),
            }))}
          />
        )}
      </div>
    </div>
  )
}
