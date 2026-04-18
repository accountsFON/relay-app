import Link from 'next/link'
import type { Client } from '@prisma/client'
import { Badge } from '@/components/ui/badge'

export function ClientListItem({ client }: { client: Client }) {
  return (
    <Link
      href={`/clients/${client.id}`}
      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 sm:p-4 transition-colors hover:bg-muted/50"
    >
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground truncate">{client.name}</div>
        <div className="mt-0.5 text-xs text-muted-foreground truncate">
          {client.industry ?? 'No industry set'}
          {client.location ? ` · ${client.location}` : ''}
        </div>
      </div>
      <Badge className="shrink-0" variant={client.status === 'active' ? 'default' : 'secondary'}>
        {client.status}
      </Badge>
    </Link>
  )
}
