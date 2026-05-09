'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { RelayStep } from '@prisma/client'
import { Bell, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  nudgeStuckBatchAction,
  takeOverBatchAction,
} from '@/server/actions/relay-admin'

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

export interface StuckBatchRowProps {
  batch: StuckBatch
  /** AM roster, used as Take-over targets when the holder is an AM. */
  ams?: { id: string; name: string }[]
  /** Designer roster, used as Take-over targets when the holder is a designer. */
  designers?: { id: string; name: string }[]
}

export function StuckBatchRow({
  batch,
  ams = [],
  designers = [],
}: StuckBatchRowProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  const [showTakeOver, setShowTakeOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Show same-role roster as Take-over candidates.
  const roster =
    batch.holder.role === 'designer'
      ? designers
      : batch.holder.role === 'account_manager'
        ? ams
        : []

  function handleNudge() {
    setError(null)
    startTransition(async () => {
      try {
        await nudgeStuckBatchAction({ batchId: batch.id })
        setDone(true)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Nudge failed')
      }
    })
  }

  function takeOver(newHolderId: string) {
    setError(null)
    startTransition(async () => {
      try {
        await takeOverBatchAction({ batchId: batch.id, newHolderId })
        setShowTakeOver(false)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Take-over failed')
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
        {error && <p className="text-[11px] text-destructive">{error}</p>}
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="xs"
          variant="outline"
          onClick={handleNudge}
          disabled={isPending || done}
        >
          <Bell />
          {done ? 'Nudged ✓' : isPending ? 'Nudging…' : 'Nudge'}
        </Button>

        {roster.length > 0 && (
          <div className="relative">
            <Button
              size="xs"
              variant="outline"
              disabled={isPending}
              onClick={() => setShowTakeOver((v) => !v)}
            >
              <UserPlus />
              Take over
            </Button>
            {showTakeOver && (
              <div className="absolute right-0 z-10 mt-1 w-48 rounded-md border bg-popover p-1 shadow-md">
                {roster.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className="block w-full rounded px-2 py-1.5 text-left text-[13px] hover:bg-accent"
                    onClick={() => takeOver(u.id)}
                  >
                    Reassign to {u.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function humanizeStep(step: string): string {
  return step
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ')
}
