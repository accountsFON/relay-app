'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { completeOnboardingAction } from '@/server/actions/relay-admin'
import { formatRelativeDays } from '@/lib/format-relative'

export interface OnboardingClient {
  id: string
  name: string
  assignedAmId: string | null
  assignedDesignerId: string | null
  createdAt: Date
}

export function OnboardingQueueRow({ client }: { client: OnboardingClient }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleComplete() {
    setError(null)
    startTransition(async () => {
      try {
        await completeOnboardingAction({ clientId: client.id })
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed')
      }
    })
  }

  const missingAm = !client.assignedAmId
  const missingDesigner = !client.assignedDesignerId

  return (
    <div className="flex items-center justify-between gap-4 px-3 py-3">
      <div className="min-w-0 flex-1">
        <Link
          href={`/clients/${client.id}`}
          className="text-[14px] font-medium text-foreground hover:underline"
        >
          {client.name}
        </Link>
        <p className="text-[11px] text-muted-foreground">
          {missingAm ? '⚠️ no AM · ' : ''}
          {missingDesigner ? '⚠️ no designer · ' : ''}
          imported {formatRelativeDays(client.createdAt)}
        </p>
        {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
      </div>
      <Button
        size="sm"
        onClick={handleComplete}
        disabled={isPending}
      >
        {isPending ? 'Starting…' : 'Complete onboarding + open relay'}
      </Button>
    </div>
  )
}

