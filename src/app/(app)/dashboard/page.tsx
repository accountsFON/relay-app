import { RelayStep, RelayEventType } from '@prisma/client'
import { requireOrgContext } from '@/server/middleware/auth'
import { getMonthlyCostSummary } from '@/server/repositories/contentRuns'
import {
  listBatchesForOrg,
  listClientPipelineBatches,
} from '@/server/repositories/batches'
import { db } from '@/db/client'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/page-header'
import { PageSection } from '@/components/ui/page-section'
import { EmptyState } from '@/components/ui/empty-state'
import { DataRow, DataRowGroup, RowAvatar } from '@/components/ui/data-row'
import {
  clientKanbanColumn,
  type ClientKanbanColumn,
} from '@/lib/batch-sub-status'
import { KanbanCard } from '@/components/relay/kanban-card'
import {
  DashboardRelayTrack,
  type DashboardRelayTrackStation,
} from '@/components/relay/dashboard-relay-track'
import type { RunnerRelay } from '@/components/relay/relay-runner-card'
import { parseDateScope, dateScopeLabel } from '@/lib/date-scope'
import { ShowArchivedToggle } from '@/components/relay/show-archived-toggle'

/**
 * Full relay track, left to right. The dashboard surfaces every step so the
 * race reads as one sweep from onboarding through final QA. Designer view
 * is a filtered subset of this same ordering.
 */
const AM_TRACK_STEPS: RelayStep[] = [
  RelayStep.onboarding_gate,
  RelayStep.copy,
  RelayStep.in_design,
  RelayStep.designs_completed,
  RelayStep.am_review_design,
  RelayStep.design_revisions,
  RelayStep.am_qa_pre_client,
  RelayStep.sent_to_client,
  RelayStep.client_decision,
  RelayStep.ready_to_schedule,
  RelayStep.implementing_revisions,
  RelayStep.revisions_complete,
  RelayStep.final_qa_schedule,
]

/**
 * Designer view scopes to the steps where a designer is the holder or is
 * actively being unblocked. Mirrors the prior DESIGNER_COLUMNS shape but
 * uses raw RelayStep keys so the same component renders both views.
 */
const DESIGNER_TRACK_STEPS: RelayStep[] = [
  RelayStep.in_design,
  RelayStep.designs_completed,
  RelayStep.design_revisions,
]

const CLIENT_COLUMNS: ClientKanbanColumn[] = [
  'Awaiting Your Approval',
  'In Production',
]

const TRANSITION_EVENT_TYPES: RelayEventType[] = [
  RelayEventType.pass_forward,
  RelayEventType.send_back,
]

/**
 * Pull the most recent transition timestamp for each batch in the given set
 * so the relay track can flag runners whose baton was just passed.
 *
 * One round trip via groupBy(_max). The page owns this so the batches
 * repository stays untouched in this PR.
 */
async function lastTransitionByBatch(
  batchIds: string[],
): Promise<Map<string, Date>> {
  const map = new Map<string, Date>()
  if (batchIds.length === 0) return map
  const rows = await db.relayEvent.groupBy({
    by: ['batchId'],
    where: {
      batchId: { in: batchIds },
      type: { in: TRANSITION_EVENT_TYPES },
    },
    _max: { createdAt: true },
  })
  for (const row of rows) {
    if (row._max.createdAt) {
      map.set(row.batchId, row._max.createdAt)
    }
  }
  return map
}

type OrgBatch = Awaited<ReturnType<typeof listBatchesForOrg>>[number]

function daysOnStep(createdAt: Date): number {
  return Math.max(
    0,
    Math.floor((Date.now() - createdAt.getTime()) / (24 * 60 * 60 * 1000)),
  )
}

function toRunner(
  batch: OrgBatch,
  lastTransitionAt: Date | null,
): RunnerRelay {
  return {
    id: batch.id,
    clientId: batch.clientId,
    clientName: batch.client?.name ?? '',
    label: batch.label,
    daysOnStep: daysOnStep(batch.createdAt),
    holder: {
      id: batch.holder?.id ?? '',
      name: batch.holder?.name ?? '',
    },
    lastTransitionAt,
  }
}

function bucketRunners(
  batches: OrgBatch[],
  steps: RelayStep[],
  transitions: Map<string, Date>,
): DashboardRelayTrackStation[] {
  const buckets = new Map<RelayStep, RunnerRelay[]>()
  for (const step of steps) buckets.set(step, [])
  for (const batch of batches) {
    const list = buckets.get(batch.currentStep)
    if (!list) continue
    list.push(toRunner(batch, transitions.get(batch.id) ?? null))
  }
  // Most recently moved first inside each station.
  for (const list of buckets.values()) {
    list.sort((a, b) => {
      const aT = a.lastTransitionAt?.getTime() ?? 0
      const bT = b.lastTransitionAt?.getTime() ?? 0
      return bT - aT
    })
  }
  return steps.map((step) => ({
    step,
    relays: buckets.get(step) ?? [],
  }))
}

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
  const showArchived = sp.archived === '1'

  // Archived batch count for the org. Drives the toggle label on the
  // AM / Designer relay track dashboards.
  const archivedBatchCount =
    ctx.role === 'account_manager' || ctx.role === 'admin' || ctx.role === 'designer'
      ? await db.batch.onlyArchived().count({
          where: { client: { organizationId: ctx.organizationDbId } },
        })
      : 0

  if (ctx.role === 'account_manager' || ctx.role === 'admin') {
    return (
      <AmDashboard
        ctx={ctx}
        archivedBatchCount={archivedBatchCount}
        showArchived={showArchived}
      />
    )
  }
  if (ctx.role === 'designer') {
    return (
      <DesignerDashboard
        ctx={ctx}
        archivedBatchCount={archivedBatchCount}
        showArchived={showArchived}
      />
    )
  }
  if (ctx.role === 'client' && ctx.linkedClientId) {
    return <ClientDashboard linkedClientId={ctx.linkedClientId} />
  }
  return <CostFallback ctx={ctx} dateScope={dateScope} />
}

async function AmDashboard({
  ctx,
  archivedBatchCount,
  showArchived,
}: {
  ctx: { organizationDbId: string; userDbId: string; role: string }
  archivedBatchCount: number
  showArchived: boolean
}) {
  const allBatches = await listBatchesForOrg(ctx.organizationDbId, { showArchived })
  // For AMs, scope to relays on clients they're assigned to. Admins see all.
  const myBatches =
    ctx.role === 'admin'
      ? allBatches
      : allBatches.filter((b) => b.client.assignedAmId === ctx.userDbId)

  const transitions = await lastTransitionByBatch(myBatches.map((b) => b.id))
  const stations = bucketRunners(myBatches, AM_TRACK_STEPS, transitions)

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-[1600px]">
      <PageHeader
        title="My Relay"
        description={
          ctx.role === 'admin'
            ? 'Every relay in flight, moving across the track.'
            : 'Your relays, moving across the track.'
        }
      />
      <div className="mt-4">
        <ShowArchivedToggle countArchived={archivedBatchCount} />
      </div>
      <div className="mt-8">
        <DashboardRelayTrack
          stations={stations}
          viewerRole={ctx.role === 'admin' ? 'admin' : 'am'}
        />
      </div>
    </div>
  )
}

async function DesignerDashboard({
  ctx,
  archivedBatchCount,
  showArchived,
}: {
  ctx: { organizationDbId: string; userDbId: string }
  archivedBatchCount: number
  showArchived: boolean
}) {
  const allBatches = await listBatchesForOrg(ctx.organizationDbId, { showArchived })
  // Designer view: relays on clients assigned to this designer. Matches the
  // legacy DesignerDashboard scope so designers do not suddenly see other
  // designers' queues.
  const myBatches = allBatches.filter(
    (b) => b.client.assignedDesignerId === ctx.userDbId,
  )

  const transitions = await lastTransitionByBatch(myBatches.map((b) => b.id))
  const stations = bucketRunners(myBatches, DESIGNER_TRACK_STEPS, transitions)

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-5xl">
      <PageHeader
        title="My Relay"
        description="Your design queue, moving across the track."
      />
      <div className="mt-4">
        <ShowArchivedToggle countArchived={archivedBatchCount} />
      </div>
      <div className="mt-8">
        <DashboardRelayTrack stations={stations} viewerRole="designer" />
      </div>
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
        description="Relays awaiting your approval and what's in production."
      />
      {allBatches.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title="No relays yet"
            description="Your team will create relays as they prepare your content. They'll show up here when ready for your review."
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
  deletedAt?: Date | null
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
                deletedAt: batch.deletedAt ?? null,
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
      <PageHeader title="My Relay" description={`Activity for ${scopeLabel.toLowerCase()}.`} />
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
