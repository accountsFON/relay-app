import { listActiveBatchesForClient } from '@/server/repositories/batches'
import { PageSection } from '@/components/ui/page-section'
import { DataRowGroup } from '@/components/ui/data-row'
import { ActiveBatchHero } from '@/components/relay/active-batch-hero'
import { ActiveBatchRow } from '@/components/relay/active-batch-row'

/**
 * Adaptive Active Batches section on the client page.
 *  - 0 in flight: do not render (component returns null)
 *  - 1 in flight: hero card variant
 *  - 2+ in flight: equal-weight list, sorted held-by-you first then by activity
 *
 * Per spec § Section A.
 */
export async function ActiveBatchesSection({
  clientId,
  viewerUserId,
}: {
  clientId: string
  viewerUserId: string
}) {
  const batches = await listActiveBatchesForClient(clientId, viewerUserId)
  if (batches.length === 0) return null

  if (batches.length === 1) {
    return (
      <PageSection title="Active batch">
        <ActiveBatchHero clientId={clientId} batch={batches[0]} />
      </PageSection>
    )
  }

  return (
    <PageSection title={`Active batches (${batches.length})`}>
      <DataRowGroup className="-mx-1">
        {batches.map((b) => (
          <ActiveBatchRow
            key={b.id}
            clientId={clientId}
            batch={b}
            viewerUserId={viewerUserId}
          />
        ))}
      </DataRowGroup>
    </PageSection>
  )
}
