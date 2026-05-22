import { listActiveBatchesForClient, listArchivedBatchesForClient } from '@/server/repositories/batches'
import { PageSection } from '@/components/ui/page-section'
import { DataRowGroup, DataRow } from '@/components/ui/data-row'
import { EmptyState } from '@/components/ui/empty-state'
import { ActiveBatchHero } from '@/components/relay/active-batch-hero'
import { ActiveBatchRow } from '@/components/relay/active-batch-row'
import { ShowArchivedToggle } from '@/components/relay/show-archived-toggle'
import { GenerateContentDialog } from '@/components/relay/generate-content-dialog'

function nextMonthString(): string {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Adaptive Active Batches section on the client page.
 *  - 0 live in flight + 0 archived ever + viewer can edit: "Get started"
 *    CTA panel with an inline Generate content trigger (item 11).
 *  - 0 live in flight + 0 archived ever + viewer cannot edit: do not render.
 *  - 1 live in flight: hero card variant
 *  - 2+ live in flight: equal-weight list, sorted held-by-you first then by activity
 *
 * When showArchived=true, archived batches are appended below the live list
 * with a muted "Archived" pill and a link to the batch page (where the
 * RestoreBatchBanner handles restore).
 *
 * Per spec § Section A.
 */
export async function ActiveBatchesSection({
  clientId,
  viewerUserId,
  showArchived = false,
  archivedBatchCount = 0,
  canGenerate = false,
}: {
  clientId: string
  viewerUserId: string
  showArchived?: boolean
  archivedBatchCount?: number
  canGenerate?: boolean
}) {
  const batches = await listActiveBatchesForClient(clientId, viewerUserId)
  const archivedBatches = showArchived
    ? await listArchivedBatchesForClient(clientId)
    : []

  const hasContent = batches.length > 0 || archivedBatches.length > 0

  // Fresh-client path: no batches and never had any. Render a CTA panel
  // so AMs landing on a new client see a clear "start here" affordance
  // rather than a header-only Generate button buried up top.
  if (!hasContent && archivedBatchCount === 0) {
    if (!canGenerate) return null
    return (
      <PageSection title="Get started">
        <EmptyState
          title="No relays yet"
          description="Generate this client's first month of content to spin up the relay."
          className="py-12"
          action={
            <GenerateContentDialog
              clientId={clientId}
              targetMonth={nextMonthString()}
            />
          }
        />
      </PageSection>
    )
  }

  const toggle = <ShowArchivedToggle countArchived={archivedBatchCount} />

  if (batches.length === 0 && archivedBatches.length === 0) {
    // No live batches but there are archived ones (toggle is off)
    return (
      <PageSection title="Active relays" action={toggle}>
        <EmptyState
          title="Nothing in flight"
          description="There are no active relays for this client. Archived relays are still available; toggle them on to review."
          className="py-12"
        />
      </PageSection>
    )
  }

  if (batches.length === 1 && archivedBatches.length === 0) {
    return (
      <PageSection title="Active relay" action={toggle}>
        <ActiveBatchHero clientId={clientId} batch={batches[0]} />
      </PageSection>
    )
  }

  const title =
    batches.length === 1
      ? 'Active relay'
      : batches.length > 0
        ? `Active relays (${batches.length})`
        : 'Active relays'

  return (
    <PageSection title={title} action={toggle}>
      <DataRowGroup className="-mx-1">
        {batches.map((b) => (
          <ActiveBatchRow
            key={b.id}
            clientId={clientId}
            batch={b}
            viewerUserId={viewerUserId}
          />
        ))}
        {archivedBatches.map((b) => (
          <DataRow
            key={b.id}
            href={`/clients/${clientId}/batches/${b.id}`}
            title={
              <span className="flex items-center gap-2 opacity-50">
                {b.label}
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  Archived
                </span>
              </span>
            }
            subtitle={
              <span className="opacity-50">
                Archived {b.deletedAt ? b.deletedAt.toLocaleDateString() : ''}
              </span>
            }
            className="grayscale"
          />
        ))}
      </DataRowGroup>
    </PageSection>
  )
}
