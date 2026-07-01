import { listActiveBatchesForClient } from '@/server/repositories/batches'
import { PageSection } from '@/components/ui/page-section'
import { DataRowGroup } from '@/components/ui/data-row'
import { EmptyState } from '@/components/ui/empty-state'
import { ActiveBatchHero } from '@/components/relay/active-batch-hero'
import { ActiveBatchRow } from '@/components/relay/active-batch-row'
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
 * Archived relays no longer appear here; they live on the dedicated
 * /archive page.
 *
 * Per spec § Section A.
 */
export async function ActiveBatchesSection({
  clientId,
  viewerUserId,
  canGenerate = false,
  onboardingComplete = true,
}: {
  clientId: string
  viewerUserId: string
  canGenerate?: boolean
  onboardingComplete?: boolean
}) {
  const batches = await listActiveBatchesForClient(clientId, viewerUserId)

  // Fresh-client path: no live batches. Render a CTA panel so AMs landing
  // on a new client see a clear "start here" affordance rather than a
  // header-only Generate button buried up top.
  if (batches.length === 0) {
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
              disabled={!onboardingComplete}
              disabledReason="Complete onboarding first"
            />
          }
        />
      </PageSection>
    )
  }

  if (batches.length === 1) {
    return (
      <PageSection title="Active relay">
        <ActiveBatchHero clientId={clientId} batch={batches[0]} />
      </PageSection>
    )
  }

  const title = `Active relays (${batches.length})`

  return (
    <PageSection title={title}>
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
