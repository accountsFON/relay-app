import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  requireClientViewer,
  canEditClients,
} from '@/server/middleware/permissions'
import { findClientById } from '@/server/repositories/clients'
import { listRunsByClient } from '@/server/repositories/contentRuns'
import { ClientProfileView } from '@/components/clients/client-profile-view'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { PageSection } from '@/components/ui/page-section'
import { DataRow, DataRowGroup, RowAvatar } from '@/components/ui/data-row'
import { Badge, StatusDot } from '@/components/ui/badge'
import { Calendar } from 'lucide-react'
import { DeleteRunButton, RegenRunButton } from './run-management'

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireClientViewer()
  const { id } = await params

  const client = await findClientById(id, ctx.organizationDbId)
  if (!client) notFound()

  const runs = await listRunsByClient(id)
  const canEdit = canEditClients(ctx.role)

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
              <Link href={`/clients/${client.id}/edit`}>
                <Button variant="outline">Edit profile</Button>
              </Link>
              <Badge variant={client.status === 'active' ? 'primary' : 'secondary'}>
                <StatusDot status={client.status === 'active' ? 'active' : 'inactive'} />
                {client.status}
              </Badge>
            </>
          ) : (
            <Badge variant={client.status === 'active' ? 'primary' : 'secondary'}>
              <StatusDot status={client.status === 'active' ? 'active' : 'inactive'} />
              {client.status}
            </Badge>
          )
        }
      />

      {runs.length > 0 && (
        <div className="mt-10">
          <PageSection title="Content runs">
            <DataRowGroup className="-mx-1">
              {runs.map((run) => (
                <DataRow
                  key={run.id}
                  href={
                    run.status === 'complete' && run._count.posts > 0
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
                      {run.createdAt.toLocaleDateString()}
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
              ))}
            </DataRowGroup>
          </PageSection>
        </div>
      )}

      <div className="mt-10">
        <ClientProfileView client={client} canEdit={canEdit} />
      </div>
    </div>
  )
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-')
  const date = new Date(parseInt(y), parseInt(m) - 1)
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}
