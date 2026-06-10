import { redirect } from 'next/navigation'
import { requireOrgContext } from '@/server/middleware/auth'
import { isArchiveViewer } from '@/lib/archive-access'
import { listArchivedBatchesForViewer } from '@/server/repositories/batches'
import { HeroBand } from '@/components/hero-band'
import { PageSection } from '@/components/ui/page-section'
import { DataRowGroup, DataRow } from '@/components/ui/data-row'
import { EmptyState } from '@/components/ui/empty-state'

export const dynamic = 'force-dynamic'

function md(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function mdt(d: Date): string {
  return `${md(d)}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}

export default async function ArchivePage() {
  const ctx = await requireOrgContext()
  if (!isArchiveViewer(ctx)) redirect('/dashboard')

  const rows = await listArchivedBatchesForViewer(ctx)

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-3xl">
      <HeroBand title="Archive" subtitle="Relays that have been moved out of active view. Open one to restore it." />
      <div className="mt-8">
        <PageSection title="Relays">
          {rows.length === 0 ? (
            <EmptyState title="Nothing archived" description="Archived relays will appear here." className="py-12" />
          ) : (
            <DataRowGroup className="-mx-1">
              {rows.map((b) => (
                <DataRow
                  key={b.id}
                  href={`/clients/${b.clientId}/batches/${b.id}`}
                  title={
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{b.clientName}</span>
                      <span className="text-muted-foreground">·</span>
                      <span>{b.label}</span>
                    </span>
                  }
                  subtitle={
                    <span className="text-muted-foreground">
                      Created {md(b.createdAt)}
                      {b.deletedAt && <> · Archived {mdt(b.deletedAt)}</>}
                    </span>
                  }
                />
              ))}
            </DataRowGroup>
          )}
        </PageSection>
      </div>
    </div>
  )
}
