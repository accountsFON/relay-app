import type { Client } from '@prisma/client'
import { DataRow, RowAvatar } from '@/components/ui/data-row'
import { StatusDot } from '@/components/ui/badge'

export function ClientListItem({ client }: { client: Client }) {
  const subtitle = [client.industry, client.location].filter(Boolean).join(' · ') || 'No details set'

  return (
    <DataRow
      href={`/clients/${client.id}`}
      leading={<RowAvatar initials={client.name.slice(0, 2)} />}
      title={
        <span className="flex items-center gap-2">
          <StatusDot status={client.status === 'active' ? 'active' : 'inactive'} />
          {client.name}
        </span>
      }
      subtitle={subtitle}
    />
  )
}
