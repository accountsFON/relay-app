import { DataRow } from '@/components/ui/data-row'
import { STEP_LABEL, daysOnStep } from '@/components/relay/labels'
import type { RelayStep } from '@prisma/client'

export function ActiveBatchRow({
  clientId,
  batch,
  viewerUserId,
}: {
  clientId: string
  viewerUserId: string
  batch: {
    id: string
    label: string
    currentStep: RelayStep
    holder: { id: string; name: string }
    createdAt: Date
  }
}) {
  const heldByYou = batch.holder.id === viewerUserId
  const days = daysOnStep(batch.createdAt)
  return (
    <DataRow
      href={`/clients/${clientId}/batches/${batch.id}`}
      title={batch.label}
      subtitle={
        <span>
          {STEP_LABEL[batch.currentStep]} · {heldByYou ? 'you' : batch.holder.name} · {days}d
        </span>
      }
    />
  )
}
