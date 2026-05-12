import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { STEP_LABEL, daysOnStep } from '@/components/relay/labels'
import type { RelayStep } from '@prisma/client'

export function ActiveBatchHero({
  clientId,
  batch,
}: {
  clientId: string
  batch: {
    id: string
    label: string
    currentStep: RelayStep
    holder: { id: string; name: string }
    createdAt: Date
  }
}) {
  const days = daysOnStep(batch.createdAt)
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Active relay</p>
          <h3 className="mt-1 text-2xl font-bold text-foreground">{batch.label}</h3>
          <p className="mt-1 text-[15px] text-muted-foreground">
            {STEP_LABEL[batch.currentStep]} · held by {batch.holder.name} · {days}d on this step
          </p>
        </div>
        <Link href={`/clients/${clientId}/batches/${batch.id}`}>
          <Button variant="accent">
            Open relay <ArrowRight className="ml-1 size-4" />
          </Button>
        </Link>
      </div>
    </Card>
  )
}
