import Link from 'next/link'
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
import { ClientProfileView } from '@/components/clients/client-profile-view'
import { ActivityThread } from '@/components/activity/activity-thread'
import { buildMentionRoster } from '@/lib/mentions'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { PageSection } from '@/components/ui/page-section'
import { DataRow, DataRowGroup, RowAvatar } from '@/components/ui/data-row'
import { StatusDot } from '@/components/ui/badge'
import { Calendar } from 'lucide-react'
import { DeleteRunButton, RegenRunButton } from './run-management'
import { RunStatusPoller } from './run-status-poller'
import { ClientStatusBadge } from '@/components/clients/client-status-badge'
import { ClientQuickAccess } from '@/components/clients/client-quick-access'
import { ActiveBatchesSection } from '@/components/clients/active-batches-section'
import { EmptyState } from '@/components/ui/empty-state'
import { parseDateScope, dateScopeLabel } from '@/lib/date-scope'

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

  const client = await findClientForUser(ctx, id)
  if (!client) notFound()

  const [runs, activity, memberships] = await Promise.all([
    listRunsByClient(id, { dateScope }),
    listActivityForClient(client.id, {
      limit: 30,
      visibilityFilter: visibilityForViewer(ctx),
      dateRange: { from: dateScope.from, to: dateScope.to },
    }),
    listMembershipsForOrg(ctx.organizationDbId),
  ])
  const canEdit = canEditClients(ctx)
  const mentionTargets = buildMentionRoster(memberships)
  const hasActiveRun = runs.some(
    (r) => r.status === 'running' || r.status === 'queued'
  )

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-5xl">
      <PageHeader
        title={client.name}
        description={
          [client.industry, client.location].filter(Boolean).join(' · ') ||
          undefined
        }
        backHref="/clients"
        backLabel="Back to clients"
        actions={
          canEdit ? (
            <>
              <Link href={`/clients/${client.id}/generate`}>
                <Button variant="accent">Generate content</Button>
              </Link>
              <ClientStatusBadge clientId={client.id} status={client.status} canEdit={canEdit} />
            </>
          ) : (
            <ClientStatusBadge clientId={client.id} status={client.status} canEdit={canEdit} />
          )
        }
      />

      <div className="mt-6">
        <ClientQuickAccess urls={client.urls} assetsFolderUrl={client.assetsFolderUrl} />
      </div>

      <div className="mt-10">
        <ActiveBatchesSection clientId={client.id} viewerUserId={ctx.userDbId} />
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
                    leading={<RowAvatar icon={<Calendar className="size-5 text-ink-50" />} />}
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
                          <span className="text-ink-50">Queued, waiting to start…</span>
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
                      canEdit ? (
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
        <ClientProfileView client={client} canEdit={canEdit} />
      </div>

      <div className="mt-10">
        <PageSection
          title="Activity"
          description="Comments and system events for this client. Composer wires up in Phase 2."
        >
          <ActivityThread
            clientId={client.id}
            events={activity}
            mentionTargets={mentionTargets}
            hideComposer={!canEdit}
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
