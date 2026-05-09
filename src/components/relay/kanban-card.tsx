import Link from 'next/link'
import type { RelayStep } from '@prisma/client'
import { STEP_LABEL } from './labels'
import {
  deriveSubStatus,
  type BatchForSubStatus,
} from '@/lib/batch-sub-status'

export interface KanbanCardData extends BatchForSubStatus {
  id: string
  clientId: string
  label: string
  client: { name: string }
  holder: { name: string }
  currentStep: RelayStep
}

export function KanbanCard({ batch }: { batch: KanbanCardData }) {
  const sub = deriveSubStatus(batch)
  return (
    <Link
      href={`/clients/${batch.clientId}/batches/${batch.id}`}
      className="block rounded-md border border-border bg-background px-3 py-2 transition-colors hover:bg-cream-warm/40"
    >
      <p className="text-[13px] font-medium text-foreground truncate">
        {batch.client.name}
      </p>
      <p className="text-[11px] text-muted-foreground">
        {batch.label} · {STEP_LABEL[batch.currentStep]}
      </p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span
          className={
            'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] ' +
            toneClass(sub.tone)
          }
        >
          {sub.label}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {sub.daysHere}d
        </span>
      </div>
    </Link>
  )
}

function toneClass(tone: 'neutral' | 'progress' | 'attention' | 'success'): string {
  switch (tone) {
    case 'success':
      return 'bg-green-100 text-green-900'
    case 'attention':
      return 'bg-amber-100 text-amber-900'
    case 'progress':
      return 'bg-blue-100 text-blue-900'
    default:
      return 'bg-muted text-muted-foreground'
  }
}
