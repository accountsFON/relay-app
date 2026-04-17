import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  requireClientViewer,
  canEditClients,
} from '@/server/middleware/permissions'
import { findClientById } from '@/server/repositories/clients'
import { ClientProfileView } from '@/components/clients/client-profile-view'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireClientViewer()
  const { id } = await params

  const client = await findClientById(id, ctx.organizationDbId)
  if (!client) notFound()

  const canEdit = canEditClients(ctx.role)

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link
          href="/clients"
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ← Back to clients
        </Link>
      </div>

      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{client.name}</h1>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
              {client.status}
            </Badge>
            {client.industry && (
              <span className="text-sm text-slate-500">{client.industry}</span>
            )}
          </div>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Link href={`/clients/${client.id}/edit`}>
              <Button variant="outline">Edit</Button>
            </Link>
            <Link href={`/clients/${client.id}/generate`}>
              <Button>Generate content</Button>
            </Link>
          </div>
        )}
      </div>

      <ClientProfileView client={client} />
    </div>
  )
}
