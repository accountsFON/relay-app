/**
 * MissingClientUserBanner — shown at step sent_to_client when no real
 * client-role user is linked to the Client. The auto-advance to
 * client_decision only fires when a client viewer (ctx.role === 'client'
 * and currentHolder match) opens the batch, so without a linked client
 * user the batch sits at step 9 indefinitely. This banner gives the AM
 * (or admin) an explicit way to advance past the client-review leg.
 */
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, UserPlus } from 'lucide-react'
import { RelayStep } from '@prisma/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { passBatonAction } from '@/server/actions/relay'

export interface MissingClientUserBannerProps {
  batchId: string
  clientName: string
}

export function MissingClientUserBanner({
  batchId,
  clientName,
}: MissingClientUserBannerProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function skip() {
    setError(null)
    startTransition(async () => {
      try {
        await passBatonAction({
          batchId,
          toStep: RelayStep.client_decision,
        })
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Skip failed')
      }
    })
  }

  return (
    <Card
      size="sm"
      className="border-amber-300 bg-amber-50 px-4 py-3"
      data-component="missing-client-user-banner"
    >
      <div className="flex items-start gap-3">
        <UserPlus className="mt-0.5 size-4 shrink-0 text-amber-700" />
        <div className="flex-1 space-y-2">
          <div className="space-y-1">
            <p className="text-[13px] font-semibold text-amber-900">
              No client user linked to {clientName}
            </p>
            <p className="text-[12px] leading-snug text-amber-900/80">
              The auto-advance from "With client" runs when a real client
              opens the batch. Invite a client user to enable that flow, or
              skip the review and advance manually.
            </p>
          </div>
          {error && (
            <p className="text-[12px] text-destructive">{error}</p>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={skip}
            disabled={isPending}
            className="bg-white"
          >
            {isPending ? 'Advancing…' : 'Skip client review'}
            <ArrowRight />
          </Button>
        </div>
      </div>
    </Card>
  )
}
