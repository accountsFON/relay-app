import { Suspense, type ReactNode } from 'react'
import { RelayStep, RelayEventType } from '@prisma/client'
import { requireOrgContext } from '@/server/middleware/auth'
import { AccessDeniedToast } from '@/components/dashboard/access-denied-toast'
import { ClientNoAccessState } from '@/components/dashboard/client-no-access-state'
import { getMonthlyCostSummary } from '@/server/repositories/contentRuns'
import {
  listBatchesForOrg,
  listClientPipelineBatches,
} from '@/server/repositories/batches'
import { db } from '@/db/client'
import { Card } from '@/components/ui/card'
import { HeroBand } from '@/components/hero-band'
import { PageSection } from '@/components/ui/page-section'
import { EmptyState } from '@/components/ui/empty-state'
import { EmptyStateCard } from '@/components/ui/empty-state-card'
import { DataRow, DataRowGroup, RowAvatar } from '@/components/ui/data-row'
import {
  clientKanbanColumn,
  type ClientKanbanColumn,
} from '@/lib/batch-sub-status'
import { KanbanCard } from '@/components/relay/kanban-card'
import { StatusPill } from '@/components/ui/status-pill'
import {
  DashboardRelayTrack,
  type DashboardRelayTrackStation,
} from '@/components/relay/dashboard-relay-track'
import type { RunnerRelay } from '@/components/relay/relay-runner-card'
import { parseDateScope, dateScopeLabel } from '@/lib/date-scope'
import { DashboardSelectMode } from '@/components/relay/dashboard-select-mode'

/**
 * Full relay track, left to right, starting at Copy Review. The dashboard
 * surfaces every step so the race reads as one sweep through final QA.
 * Designer view is a filtered subset of this same ordering.
 */
const AM_TRACK_STEPS: RelayStep[] = [
  RelayStep.copy,
  RelayStep.in_design,
  // `designs_completed` removed per Phase 3 item 15 PR1. Enum value
  // preserved so historical events render; no live batch lands here.
  RelayStep.am_review_design,
  // `design_revisions` removed (merge design steps 2026-06-26). "Request changes"
  // is an in-step action on am_review_design; enum value kept for historical rows.
  RelayStep.am_qa_pre_client,
  RelayStep.sent_to_client,
  RelayStep.client_decision,
  RelayStep.ready_to_schedule,
  RelayStep.implementing_revisions,
  RelayStep.revisions_complete,
  RelayStep.final_qa_schedule,
  RelayStep.completed,
]

/**
 * Designer view scopes to the steps where a designer is the holder or is
 * actively being unblocked. Mirrors the prior DESIGNER_COLUMNS shape but
 * uses raw RelayStep keys so the same component renders both views.
 */
const DESIGNER_TRACK_STEPS: RelayStep[] = [
  RelayStep.in_design,
  // `designs_completed` removed per Phase 3 item 15 PR1.
  // `design_revisions` removed (merge design steps 2026-06-26): the designer
  // reworks in-step while the batch stays at am_review_design, AM-held.
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
      avatarUrl: batch.holder?.avatarUrl ?? null,
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
  let dashboard: ReactNode
  if (ctx.role === 'account_manager' || ctx.role === 'admin') {
    dashboard = <AmDashboard ctx={ctx} />
  } else if (ctx.role === 'designer') {
    dashboard = <DesignerDashboard ctx={ctx} />
  } else if (ctx.role === 'client' && ctx.linkedClientId) {
    dashboard = <ClientDashboard linkedClientId={ctx.linkedClientId} />
  } else if (ctx.role === 'client') {
    // Client persona with no linked client. Never show the agency-internal
    // cost view; surface a clear dead end instead.
    dashboard = <ClientNoAccessState />
  } else {
    dashboard = <CostFallback ctx={ctx} dateScope={dateScope} />
  }

  return (
    <>
      {/* Fires the "no access" toast when reached via redirectAccessDenied
          (?denied=1), regardless of which role-specific dashboard renders.
          Wrapped in Suspense because it reads useSearchParams. */}
      <Suspense fallback={null}>
        <AccessDeniedToast />
      </Suspense>
      {dashboard}
    </>
  )
}

async function AmDashboard({
  ctx,
}: {
  ctx: { organizationDbId: string; userDbId: string; role: string }
}) {
  const allBatches = await listBatchesForOrg(ctx.organizationDbId)
  // For AMs, scope to relays on clients they're assigned to. Admins see all.
  const myBatches =
    ctx.role === 'admin'
      ? allBatches
      : allBatches.filter((b) => b.client.assignedAmId === ctx.userDbId)

  const transitions = await lastTransitionByBatch(myBatches.map((b) => b.id))
  const stations = bucketRunners(myBatches, AM_TRACK_STEPS, transitions)
  const selectableRelays = myBatches.map((b) => ({
    id: b.id,
    clientName: b.client?.name,
    deletedAt: b.deletedAt,
  }))

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-[1600px]">
      <HeroBand
        title="My relay"
        subtitle={
          ctx.role === 'admin'
            ? 'Every relay in flight, moving across the track.'
            : 'Your relays, moving across the track.'
        }
      />
      <DashboardSelectMode relays={selectableRelays}>
        <div className="mt-8">
          <DashboardRelayTrack
            stations={stations}
            viewerRole={ctx.role === 'admin' ? 'admin' : 'am'}
          />
        </div>
      </DashboardSelectMode>
    </div>
  )
}

export async function DesignerDashboard({
  ctx,
}: {
  ctx: { organizationDbId: string; userDbId: string }
}) {
  const allBatches = await listBatchesForOrg(ctx.organizationDbId)
  // Designer view: relays on clients assigned to this designer. Matches the
  // legacy DesignerDashboard scope so designers do not suddenly see other
  // designers' queues.
  const myBatches = allBatches.filter(
    (b) => b.client.assignedDesignerId === ctx.userDbId,
  )

  const transitions = await lastTransitionByBatch(myBatches.map((b) => b.id))
  const stations = bucketRunners(myBatches, DESIGNER_TRACK_STEPS, transitions)

  // Merge design steps (2026-06-26): requested changes sit on am_review_design
  // (AM-held), so they fall outside DESIGNER_TRACK_STEPS and dropped off the
  // designer board. Surface them in a dedicated tile so the designer still sees
  // what needs reworking without relying on the bell alone.
  const awaitingRevisions = myBatches.filter(
    (b) =>
      b.currentStep === RelayStep.am_review_design &&
      b.currentSubState === 'awaiting_design_revisions',
  )

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-5xl">
      <HeroBand
        title="My relay"
        subtitle="Your design queue, moving across the track."
      />
      {awaitingRevisions.length > 0 && (
        <div className="mt-8">
          <PageSection title="Awaiting your revisions">
            <DataRowGroup className="-mx-1">
              {awaitingRevisions.map((b) => (
                <DataRow
                  key={b.id}
                  href={`/clients/${b.clientId}/batches/${b.id}`}
                  leading={
                    <RowAvatar initials={(b.client?.name ?? '?').slice(0, 2)} />
                  }
                  title={b.label}
                  subtitle={b.client?.name ?? ''}
                  meta="Revise designs"
                />
              ))}
            </DataRowGroup>
          </PageSection>
        </div>
      )}
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
      <HeroBand
        title="Your content"
        subtitle="Relays awaiting your approval and what's in production."
      />
      {allBatches.length === 0 ? (
        <div className="mt-10 mx-auto max-w-md">
          <EmptyStateCard
            tint="blue"
            shape="starburst"
            label="No relays yet. Your team will queue content here for review."
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
}

/**
 * Color map for the two client-facing kanban columns. Mirrors the step
 * color heuristic in `relay-step-colors.ts`:
 *   - 'Awaiting Your Approval' = client-held = blue
 *   - 'In Production' = AM/Designer-held = yellow (AM is the majority owner)
 *
 * Typed against StatusPill's AccentColor set (no `ink`) because the client
 * kanban never surfaces a fully-completed column.
 */
const CLIENT_COLUMN_COLOR: Record<ClientKanbanColumn, 'blue' | 'yellow' | 'coral' | 'neutral'> = {
  'Awaiting Your Approval': 'blue',
  'In Production': 'yellow',
}

function KanbanColumn({
  title,
  batches,
}: {
  title: ClientKanbanColumn
  batches: ColumnBatch[]
}) {
  const dotColor = CLIENT_COLUMN_COLOR[title]
  // EmptyStateCard tints don't include 'neutral'; fall back to blue if a
  // future column ever maps to neutral so the surface keeps tinting.
  const emptyTint: 'blue' | 'yellow' | 'coral' =
    dotColor === 'neutral' ? 'blue' : dotColor
  return (
    <div className="rounded-xl bg-neutral-100/40 p-2.5">
      <div className="mb-3 flex items-center justify-between px-1">
        <StatusPill variant="dot" dotColor={dotColor}>
          <span className="uppercase tracking-wider text-[10px]">{title}</span>
        </StatusPill>
        <span className="text-xs text-muted-foreground">{batches.length}</span>
      </div>
      <div className="space-y-2">
        {batches.length === 0 ? (
          <EmptyStateCard
            tint={emptyTint}
            shape="asterisk"
            label="Nothing here yet"
          />
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
      <HeroBand title="My relay" subtitle={`Activity for ${scopeLabel.toLowerCase()}.`} />
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
