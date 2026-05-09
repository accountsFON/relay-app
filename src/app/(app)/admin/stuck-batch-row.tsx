'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { RelayStep } from '@prisma/client'
import { Button } from '@/components/ui/button'
import { nudgeStuckBatchAction } from '@/server/actions/relay-admin'

export interface StuckBatch {
  id: string
  clientId: string
  label: string
  currentStep: RelayStep
  currentHolder: string
  createdAt: Date
  client: { id: string; name: string }
  holder: { id: string; name: string; role: string }
}

export function StuckBatchRow({ batch }: { batch: StuckBatch }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [done, setDone] = useState(false)

  function handleNudge() {
    startTransition(async () => {
      try {
        await nudgeStuckBatchAction({ batchId: batch.id })
        setDone(true)
        router.refresh()
      } catch {
        // best effort
      }
    })
  }

  const days = Math.floor(
    (Date.now() - new Date(batch.createdAt).getTime()) / 86_400_000,
  )

  return (
    <div className="flex items-center justify-between gap-4 px-3 py-3">
      <div className="min-w-0 flex-1">
        <Link
          href={`/clients/${batch.clientId}/batches/${batch.id}`}
          className="text-[14px] font-medium text-foreground hover:underline"
        >
          {batch.client.name} · {batch.label}
        </Link>
        <p className="text-[11px] text-muted-foreground">
          {humanizeStep(batch.currentStep)} · holder {batch.holder.name} · {days}d here
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={handleNudge}
        disabled={isPending || done}
      >
        {done ? 'Nudged ✓' : isPending ? 'Nudging…' : 'Nudge holder'}
      </Button>
    </div>
  )
}

function humanizeStep(step: string): string {
  return step
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ')
}
