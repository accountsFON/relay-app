import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  requireClientViewer,
  canEditClients,
} from '@/server/middleware/permissions'
import { findClientById } from '@/server/repositories/clients'
import { listRunsByClient } from '@/server/repositories/contentRuns'
import { ClientProfileView } from '@/components/clients/client-profile-view'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DeleteRunButton, RegenRunButton } from './run-management'

const STATUS_COLORS: Record<string, string> = {
  complete: 'text-green-600 bg-green-50',
  running: 'text-amber-600 bg-amber-50',
  queued: 'text-blue-600 bg-blue-50',
  failed: 'text-red-600 bg-red-50',
}

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
    <div className="p-4 md:p-8">
      <div className="mb-4 sm:mb-6">
        <Link
          href="/clients"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to clients
        </Link>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground sm:text-2xl truncate">{client.name}</h1>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
              {client.status}
            </Badge>
            {client.industry && (
              <span className="text-sm text-muted-foreground">{client.industry}</span>
            )}
          </div>
        </div>
        {canEdit && (
          <div className="flex shrink-0 gap-2">
            <Link href={`/clients/${client.id}/edit`}>
              <Button variant="outline">Edit</Button>
            </Link>
            <Link href={`/clients/${client.id}/generate`}>
              <Button>Generate content</Button>
            </Link>
          </div>
        )}
      </div>

      {runs.length > 0 && (
        <div className="mb-6 sm:mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Content Runs
          </h2>
          <div className="space-y-3">
            {runs.map((run) => (
              <Card key={run.id} className="p-3 sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                    <div>
                      <p className="font-medium text-foreground">
                        {formatMonth(run.targetMonth)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {run.createdAt.toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[run.status] ?? 'text-muted-foreground bg-muted'}`}
                    >
                      {run.status}
                    </span>
                    {run._count.posts > 0 && (
                      <span className="text-sm text-muted-foreground">
                        {run._count.posts} posts
                      </span>
                    )}
                    {run.totalCostUsd && (
                      <span className="text-sm text-muted-foreground">
                        ${Number(run.totalCostUsd).toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {run.status === 'complete' && run._count.posts > 0 && (
                      <Link href={`/clients/${client.id}/runs/${run.id}`}>
                        <Button variant="outline" size="sm">
                          View posts
                        </Button>
                      </Link>
                    )}
                    <RegenRunButton clientId={client.id} targetMonth={run.targetMonth} status={run.status} />
                    <DeleteRunButton runId={run.id} status={run.status} />
                    {run.status === 'failed' && run.errorMessage && (
                      <span className="text-xs text-destructive max-w-xs truncate">
                        {run.errorMessage}
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <ClientProfileView client={client} />
    </div>
  )
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-')
  const date = new Date(parseInt(y), parseInt(m) - 1)
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}
