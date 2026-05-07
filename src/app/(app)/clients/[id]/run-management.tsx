'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { deleteContentRun } from '../run-actions'

export function DeleteRunButton({ runId, status }: { runId: string; status: string }) {
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  if (status === 'running') return null

  if (!confirming) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setConfirming(true)
        }}
      >
        Delete
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="destructive"
        size="sm"
        disabled={isPending}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          startTransition(async () => {
            await deleteContentRun(runId)
            router.refresh()
          })
        }}
      >
        {isPending ? 'Deleting…' : 'Confirm'}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setConfirming(false)
        }}
      >
        Cancel
      </Button>
    </div>
  )
}

export function RegenRunButton({
  clientId,
  targetMonth,
  status,
}: {
  clientId: string
  targetMonth: string
  status: string
}) {
  if (status === 'running' || status === 'queued') return null

  return (
    <Link
      href={`/clients/${clientId}/generate?month=${targetMonth}`}
      onClick={(e) => e.stopPropagation()}
    >
      <Button variant="ghost" size="sm">
        Re-run
      </Button>
    </Link>
  )
}
