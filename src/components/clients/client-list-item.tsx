import Link from 'next/link'
import type { Client } from '@prisma/client'
import { Badge } from '@/components/ui/badge'

export function ClientListItem({ client }: { client: Client }) {
  return (
    <Link
      href={`/clients/${client.id}`}
      className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:bg-slate-50"
    >
      <div>
        <div className="text-sm font-semibold text-slate-900">{client.name}</div>
        <div className="mt-0.5 text-xs text-slate-500">
          {client.industry ?? 'No industry set'}
          {client.location ? ` · ${client.location}` : ''}
        </div>
      </div>
      <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
        {client.status}
      </Badge>
    </Link>
  )
}
