import Link from 'next/link'
import {
  requireClientViewer,
  canEditClients,
} from '@/server/middleware/permissions'
import { listClientsForUser } from '@/server/repositories/clients'
import { db } from '@/db/client'
import { BulkGenerateList } from './bulk-generate'
import { Button } from '@/components/ui/button'
import { HeroBand } from '@/components/hero-band'
import { EmptyStateCard } from '@/components/ui/empty-state-card'
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
      <HeroBand
        title="Clients"
        subtitle={`${clients.length} ${clients.length === 1 ? 'client' : 'clients'} in this workspace.`}
      />
      {canCreate && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Link href="/clients/new">
            <Button variant="accent">New client</Button>
          </Link>
          <Link href="/clients/import">
            <Button variant="outline">Import CSV</Button>
          </Link>
        </div>
      )}

      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <ShowArchivedToggle countArchived={archivedClientCount} />
        </div>

        {clients.length === 0 ? (
          <div className="mx-auto max-w-md space-y-4">
            <EmptyStateCard
              tint="blue"
              shape="starburst"
              label={
                showArchived
                  ? 'No archived clients.'
                  : 'Add a brand and Relay can start drafting their content.'
              }
            />
            {!showArchived && canCreate && (
              <div className="flex justify-center">
                <Link href="/clients/new">
                  <Button variant="accent" size="lg">
                    Add your first client
                  </Button>
                </Link>
              </div>
            )}
          </div>
        ) : (
          <BulkGenerateList
            clients={clients.map((c) => ({
              id: c.id,
              name: c.name,
              status: c.status,
              industry: c.industry,
              location: c.location,
              isArchived: Boolean(c.deletedAt),
              onboardingComplete: c.onboardingCompletedAt != null,
            }))}
          />
        )}
      </div>
    </div>
  )
}
