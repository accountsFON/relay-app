import { notFound } from 'next/navigation'
import {
  requireClientViewer,
  canEditClients,
} from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import { listRunsByClient } from '@/server/repositories/contentRuns'
import {
  listActivityForClient,
  visibilityForViewer,
} from '@/server/repositories/activityEvents'
import { listMembershipsForOrg } from '@/server/repositories/memberships'
import { db } from '@/db/client'
import { ClientProfileView } from '@/components/clients/client-profile-view'
import { ActivityThread } from '@/components/activity/activity-thread'
import { buildMentionRoster } from '@/lib/mentions'
import { HeroBand } from '@/components/hero-band'
import { PageSection } from '@/components/ui/page-section'
import { DataRow, DataRowGroup, RowAvatar } from '@/components/ui/data-row'
import { StatusDot } from '@/components/ui/badge'
import { Calendar } from 'lucide-react'
import { GenerateContentDialog } from '@/components/relay/generate-content-dialog'
import { DeleteRunButton, RegenRunButton } from './run-management'
import { RunStatusPoller } from './run-status-poller'
import { ClientStatusBadge } from '@/components/clients/client-status-badge'
import { ClientQuickAccess } from '@/components/clients/client-quick-access'
import { ClientTeamHeader } from '@/components/clients/client-team-header'
import { ActiveBatchesSection } from '@/components/clients/active-batches-section'
import { can } from '@/server/auth/permissions'
import { EmptyState } from '@/components/ui/empty-state'
import { parseDateScope, dateScopeLabel } from '@/lib/date-scope'
import { ArchiveClientButton } from '@/components/relay/archive-client-button'
import { RestoreClientBanner } from '@/components/relay/restore-client-banner'
import { InFlightBanner } from '@/components/relay/in-flight-banner'

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireClientViewer()
  const { id } = await params
  const sp = await searchParams
  const dateScope = parseDateScope({
    scope: typeof sp.scope === 'string' ? sp.scope : null,
    from: typeof sp.from === 'string' ? sp.from : null,
    to: typeof sp.to === 'string' ? sp.to : null,
  })
  const showArchived = sp.archived === '1'

  // findClientForUser now uses withArchived() so archived clients still load.
  const client = await findClientForUser(ctx, id)
  if (!client) notFound()

  // Resolve the display name for the user who archived the client (if any).
  let archivedByName: string | null = null
  if (client.deletedAt && client.deletedBy) {
    const actor = await db.user.findUnique({
      where: { id: client.deletedBy },
      select: { name: true },
    })
    archivedByName = actor?.name ?? null
  }

  const [runs, activity, memberships, archivedBatchCount] = await Promise.all([
    listRunsByClient(id, { dateScope }),
    listActivityForClient(client.id, {
      limit: 30,
      visibilityFilter: visibilityForViewer(ctx),
      dateRange: { from: dateScope.from, to: dateScope.to },
    }),
    listMembershipsForOrg(ctx.organizationDbId),
    db.batch.onlyArchived().count({ where: { clientId: id } }),
  ])
  const canEdit = canEditClients(ctx)
  const canManageTeam = can(ctx, 'admin.portal')
  const mentionTargets = buildMentionRoster(memberships)

  // Map memberships → role-filtered option lists for the AM/Designer pickers,
  // plus enrich the assigned ids with name + avatar for read-only rendering.
  const amOptions = memberships
    .filter((m) => m.role === 'account_manager' || m.role === 'admin')
    .map((m) => ({ id: m.user.id, name: m.user.name }))
  const designerOptions = memberships
    .filter((m) => m.role === 'designer' || m.role === 'admin')
    .map((m) => ({ id: m.user.id, name: m.user.name }))
  const userIndex = new Map(memberships.map((m) => [m.user.id, m.user]))
  const assignedAm = client.assignedAmId
    ? (userIndex.get(client.assignedAmId) ?? null)
    : null
  const assignedDesigner = client.assignedDesignerId
    ? (userIndex.get(client.assignedDesignerId) ?? null)
    : null
  const hasActiveRun = runs.some(
    (r) => r.status === 'running' || r.status === 'queued'
  )
  // Actions (generate content, archive) are unavailable on archived clients.
  const isLive = !client.deletedAt

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-5xl">
      {client.deletedAt && (
        <div className="mb-6">
          <RestoreClientBanner
            clientId={client.id}
            archivedAt={client.deletedAt}
            archivedBy={archivedByName}
          />
        </div>
      )}

      <HeroBand
        title={client.name}
        subtitle={
          [client.industry, client.location].filter(Boolean).join(' · ') ||
          undefined
        }
        breadcrumb={[
          { label: 'Clients', href: '/clients' },
          { label: client.name },
        ]}
      />
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {canEdit ? (
          <>
            {isLive && (
              <>
                <GenerateContentDialog
                  clientId={client.id}
                  targetMonth={getNextMonth()}
                />
                <ArchiveClientButton clientId={client.id} clientName={client.name} />
              </>
            )}
            <ClientStatusBadge clientId={client.id} status={client.status} canEdit={isLive && canEdit} />
          </>
        ) : (
          <ClientStatusBadge clientId={client.id} status={client.status} canEdit={false} />
        )}
      </div>

      <div className="mt-6">
        <ClientTeamHeader
          clientId={client.id}
          clientName={client.name}
          am={
            assignedAm
              ? {
                  id: assignedAm.id,
                  name: assignedAm.name,
                  avatarUrl: assignedAm.avatarUrl,
                }
              : null
          }
          designer={
            assignedDesigner
              ? {
                  id: assignedDesigner.id,
                  name: assignedDesigner.name,
                  avatarUrl: assignedDesigner.avatarUrl,
                }
              : null
          }
          amOptions={amOptions}
          designerOptions={designerOptions}
          canManage={canManageTeam}
        />
      </div>

      <div className="mt-4">
        <ClientQuickAccess
          urls={client.urls}
          assetsFolderUrl={client.assetsFolderUrl}
          canvaUrl={client.canvaUrl}
        />
      </div>

      <div className="mt-10">
        <InFlightBanner clientId={client.id} />
        <ActiveBatchesSection
          clientId={client.id}
          viewerUserId={ctx.userDbId}
          showArchived={showArchived}
          archivedBatchCount={archivedBatchCount}
          canGenerate={canEdit && isLive}
        />
      </div>

      <div className="mt-10">
        {hasActiveRun && <RunStatusPoller />}
        <PageSection title="Content runs">
          {runs.length === 0 ? (
            <EmptyState
              title="No runs in this scope"
              description={`Showing ${dateScopeLabel(dateScope).toLowerCase()}. Change the date scope at the top of the page to see runs from a wider window.`}
            />
          ) : (
            <DataRowGroup className="-mx-1">
              {runs.map((run) => {
                const isRunning = run.status === 'running'
                const isQueued = run.status === 'queued'
                return (
                  <DataRow
                    key={run.id}
                    href={
                      run.status === 'complete' && run._count.posts > 0
                        ? `/clients/${client.id}/runs/${run.id}`
                        : run.status === 'failed'
                          ? `/clients/${client.id}/runs/${run.id}`
                          : undefined
                    }
                    leading={<RowAvatar icon={<Calendar className="size-5 text-neutral-500" />} />}
                    title={
                      <span className="flex items-center gap-2">
                        <StatusDot status={run.status} />
                        {formatMonth(run.targetMonth)}
                      </span>
                    }
                    subtitle={
                      <span>
                        {isRunning ? (
                          <span className="text-foreground">Generating content…</span>
                        ) : isQueued ? (
                          <span className="text-neutral-500">Queued, waiting to start…</span>
                        ) : (
                          run.createdAt.toLocaleDateString()
                        )}
                        {run._count.posts > 0 && ` · ${run._count.posts} posts`}
                        {run.totalCostUsd && ` · $${Number(run.totalCostUsd).toFixed(2)}`}
                        {run.status === 'failed' && run.errorMessage && (
                          <span className="ml-2 text-destructive">{run.errorMessage}</span>
                        )}
                      </span>
                    }
                    trailing={
                      isLive && canEdit ? (
                        <div className="flex items-center gap-1">
                          <RegenRunButton clientId={client.id} targetMonth={run.targetMonth} status={run.status} />
                          <DeleteRunButton runId={run.id} status={run.status} />
                        </div>
                      ) : undefined
                    }
                  />
                )
              })}
            </DataRowGroup>
          )}
        </PageSection>
      </div>

      <div className="mt-10">
        <ClientProfileView client={client} canEdit={isLive && canEdit} />
      </div>

      <div className="mt-10">
        <PageSection
          title="Activity"
          description="Comments and system events for this client."
        >
          <ActivityThread
            clientId={client.id}
            events={activity}
            mentionTargets={mentionTargets}
            hideComposer={!canEdit || !isLive}
          />
        </PageSection>
      </div>
    </div>
  )
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-')
  const date = new Date(parseInt(y), parseInt(m) - 1)
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

function getNextMonth(): string {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
