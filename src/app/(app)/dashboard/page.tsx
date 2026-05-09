import { requireOrgContext } from '@/server/middleware/auth'
import { getMonthlyCostSummary } from '@/server/repositories/contentRuns'
import {
  listBatchesForOrg,
  listClientPipelineBatches,
} from '@/server/repositories/batches'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/page-header'
import { PageSection } from '@/components/ui/page-section'
import { EmptyState } from '@/components/ui/empty-state'
import { DataRow, DataRowGroup, RowAvatar } from '@/components/ui/data-row'
import {
  amKanbanColumn,
  clientKanbanColumn,
  designerKanbanColumn,
  type AmKanbanColumn,
  type DesignerKanbanColumn,
  type ClientKanbanColumn,
} from '@/lib/batch-sub-status'
import { KanbanCard } from '@/components/relay/kanban-card'
import { parseDateScope, dateScopeLabel } from '@/lib/date-scope'

const AM_COLUMNS: AmKanbanColumn[] = [
  'Copy',
  'Design',
  'Pre-Client QA',
  'With Client',
  'Revisions',
  'Schedule',
]
const DESIGNER_COLUMNS: DesignerKanbanColumn[] = [
  'In Design',
  'Awaiting QA',
  'Revisions',
]
const CLIENT_COLUMNS: ClientKanbanColumn[] = [
  'Awaiting Your Approval',
  'In Production',
]

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireOrgContext()
  const sp = await searchParams
  const dateScope = parseDateScope({
    scope: typeof sp.scope === 'string' ? sp.scope : null,
    from: typeof sp.from === 'string' ? sp.from : null,
    to: typeof sp.to === 'string' ? sp.to : null,
  })

  if (ctx.role === 'account_manager' || ctx.role === 'admin') {
    return <AmDashboard ctx={ctx} />
  }
  if (ctx.role === 'designer') {
    return <DesignerDashboard ctx={ctx} />
  }
  if (ctx.role === 'client' && ctx.linkedClientId) {
    return <ClientDashboard linkedClientId={ctx.linkedClientId} />
  }
  return <CostFallback ctx={ctx} dateScope={dateScope} />
}

async function AmDashboard({
  ctx,
}: {
  ctx: { organizationDbId: string; userDbId: string; role: string }
}) {
  const allBatches = await listBatchesForOrg(ctx.organizationDbId)
  // For AMs, scope to batches on clients they're assigned to. Admins see all.
  const myBatches =
    ctx.role === 'admin'
      ? allBatches
      : allBatches.filter((b) => b.client.assignedAmId === ctx.userDbId)

  const buckets = new Map<AmKanbanColumn, typeof myBatches>()
  for (const col of AM_COLUMNS) buckets.set(col, [])
  for (const batch of myBatches) {
    const col = amKanbanColumn(batch.currentStep)
    if (!col) continue
    buckets.get(col)!.push(batch)
  }

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-7xl">
      <PageHeader
        title="Dashboard"
        description={
          ctx.role === 'admin'
            ? 'Every batch in flight, grouped by step.'
            : 'Your batches, grouped by relay step.'
        }
      />
      {myBatches.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title="No active batches"
            description="When you create or take over a batch, it shows up here grouped by relay step."
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {AM_COLUMNS.map((col) => (
            <KanbanColumn
              key={col}
              title={col}
              batches={buckets.get(col) ?? []}
            />
          ))}
        </div>
      )}
    </div>
  )
}

async function DesignerDashboard({
  ctx,
}: {
  ctx: { organizationDbId: string; userDbId: string }
}) {
  const allBatches = await listBatchesForOrg(ctx.organizationDbId)
  const myBatches = allBatches.filter(
    (b) => b.client.assignedDesignerId === ctx.userDbId,
  )
  const buckets = new Map<DesignerKanbanColumn, typeof myBatches>()
  for (const col of DESIGNER_COLUMNS) buckets.set(col, [])
  for (const batch of myBatches) {
    const col = designerKanbanColumn(batch.currentStep)
    if (!col) continue
    buckets.get(col)!.push(batch)
  }

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-5xl">
      <PageHeader
        title="Dashboard"
        description="Your design queue, grouped by stage."
      />
      {myBatches.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title="Nothing in your design queue"
            description="When an AM passes a batch to design, it shows up here."
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {DESIGNER_COLUMNS.map((col) => (
            <KanbanColumn
              key={col}
              title={col}
              batches={buckets.get(col) ?? []}
            />
          ))}
        </div>
      )}
    </div>
  )
}

async function ClientDashboard({ linkedClientId }: { linkedClientId: string }) {
  const allBatches = await listClientPipelineBatches(linkedClientId)
  const buckets = new Map<ClientKanbanColumn, typeof allBatches>()
  for (const col of CLIENT_COLUMNS) buckets.set(col, [])
  for (const batch of allBatches) {
    const col = clientKanbanColumn(batch.currentStep)
    if (!col) continue
    buckets.get(col)!.push(batch as never)
  }

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-4xl">
      <PageHeader
        title="Your content"
        description="Batches awaiting your approval and what's in production."
      />
      {allBatches.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title="No batches yet"
            description="Your team will create batches as they prepare your content. They'll show up here when ready for your review."
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {CLIENT_COLUMNS.map((col) => (
            <KanbanColumn
              key={col}
              title={col}
              batches={(buckets.get(col) ?? []) as never[]}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface ColumnBatch {
  id: string
  clientId: string
  label: string
  currentStep: import('@prisma/client').RelayStep
  currentSubState: string | null
  createdAt: Date
  client?: { name: string }
  holder?: { name: string }
  revisionPlan?: { items: { status: import('@prisma/client').RevisionItemStatus }[] } | null
}

function KanbanColumn({
  title,
  batches,
}: {
  title: string
  batches: ColumnBatch[]
}) {
  return (
    <div className="rounded-md bg-cream-warm/40 p-2.5">
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <span className="text-[11px] text-muted-foreground">
          {batches.length}
        </span>
      </div>
      <div className="space-y-2">
        {batches.length === 0 ? (
          <p className="px-1 text-[11px] text-muted-foreground italic">empty</p>
        ) : (
          batches.map((batch) => (
            <KanbanCard
              key={batch.id}
              batch={{
                id: batch.id,
                clientId: batch.clientId,
                label: batch.label,
                currentStep: batch.currentStep,
                currentSubState: batch.currentSubState,
                createdAt: batch.createdAt,
                client: { name: batch.client?.name ?? '' },
                holder: { name: batch.holder?.name ?? '' },
                revisionPlan: batch.revisionPlan ?? null,
              }}
            />
          ))
        )}
      </div>
    </div>
  )
}

async function CostFallback({
  ctx,
  dateScope,
}: {
  ctx: { organizationDbId: string }
  dateScope: ReturnType<typeof parseDateScope>
}) {
  let costSummary = {
    totalCostUsd: 0,
    totalRuns: 0,
    byClient: [] as { name: string; cost: number; runs: number }[],
  }
  try {
    costSummary = await getMonthlyCostSummary(ctx.organizationDbId, { dateScope })
  } catch {
    // ignore
  }

  const scopeLabel = dateScopeLabel(dateScope)
  const avgCost =
    costSummary.totalRuns > 0
      ? costSummary.totalCostUsd / costSummary.totalRuns
      : 0

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-6xl">
      <PageHeader title="Dashboard" description={`Activity for ${scopeLabel.toLowerCase()}.`} />
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        <StatCard
          label={`${scopeLabel} cost`}
          value={`$${costSummary.totalCostUsd.toFixed(2)}`}
        />
        <StatCard
          label={`${scopeLabel} runs`}
          value={costSummary.totalRuns.toLocaleString()}
        />
        <StatCard label="Avg cost / run" value={`$${avgCost.toFixed(2)}`} />
      </div>
      <div className="mt-10">
        {costSummary.byClient.length > 0 ? (
          <PageSection title="Cost by client">
            <DataRowGroup className="-mx-1">
              {costSummary.byClient.map((c) => (
                <DataRow
                  key={c.name}
                  leading={<RowAvatar initials={c.name.slice(0, 2)} />}
                  title={c.name}
                  subtitle={`${c.runs} ${c.runs === 1 ? 'run' : 'runs'}`}
                  meta={`$${c.cost.toFixed(4)}`}
                />
              ))}
            </DataRowGroup>
          </PageSection>
        ) : (
          <EmptyState
            title="Nothing's shipped yet."
            description="Generate content for a client and cost tracking will start showing up here."
          />
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <div className="px-5">
        <p className="text-[13px] text-muted-foreground">{label}</p>
        <p className="mt-2 text-3xl font-bold text-foreground tabular-nums tracking-[-0.5px]">
          {value}
        </p>
      </div>
    </Card>
  )
}
