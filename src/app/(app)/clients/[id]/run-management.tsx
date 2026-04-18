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
        variant="outline"
        size="sm"
        className="text-red-600 hover:text-red-700 hover:bg-red-50"
        onClick={() => setConfirming(true)}
      >
        Delete
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        className="text-red-600 hover:bg-red-50"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            await deleteContentRun(runId)
            router.refresh()
          })
        }}
      >
        {isPending ? 'Deleting...' : 'Confirm delete'}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setConfirming(false)}
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
    <Link href={`/clients/${clientId}/generate?month=${targetMonth}`}>
      <Button variant="outline" size="sm">
        Re-run
      </Button>
    </Link>
  )
}
