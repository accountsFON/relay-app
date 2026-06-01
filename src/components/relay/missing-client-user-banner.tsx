/**
 * MissingClientUserBanner: shown when a batch is in a client-held step
 * (sent_to_client or client_decision) but no client-role user is linked to
 * the Client. Without a real client viewer the relay would sit on that
 * step indefinitely, so the banner gives the AM/admin holder an explicit
 * manual advance.
 *
 * - sent_to_client (UI step 8): the 8 → 9 transition is `auto` and only
 *   fires when ctx.role === 'client'. Button label is "Skip client review"
 *   and advances to client_decision (UI step 9).
 * - client_decision (UI step 9): the 9 → 10 transition is `forward` and
 *   normally happens when the client approves. Button label is "Approve on
 *   behalf of client" and advances to ready_to_schedule (UI step 10).
 *
 * Both modes share the same shell so the user sees a consistent UI; only
 * the body copy + button text + target step differ.
 */
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, UserPlus } from 'lucide-react'
import { RelayStep } from '@prisma/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { passBatonAction } from '@/server/actions/relay'

type SupportedStep = typeof RelayStep.sent_to_client | typeof RelayStep.client_decision

export interface MissingClientUserBannerProps {
  batchId: string
  clientName: string
  currentStep: SupportedStep
}

interface ModeConfig {
  toStep: RelayStep
  description: string
  buttonLabel: string
  pendingLabel: string
}

function configForStep(step: SupportedStep): ModeConfig {
  if (step === RelayStep.sent_to_client) {
    return {
      toStep: RelayStep.client_decision,
      description:
        'The auto-advance from "With client" runs when a real client opens the relay. Invite a client user to enable that flow, or skip the review and advance manually.',
      buttonLabel: 'Skip client review',
      pendingLabel: 'Advancing…',
    }
  }
  return {
    toStep: RelayStep.ready_to_schedule,
    description:
      'The client decision step normally advances when a real client approves. Invite a client user to enable that flow, or approve on their behalf to keep the relay moving.',
    buttonLabel: 'Approve on behalf of client',
    pendingLabel: 'Approving…',
  }
}

export function MissingClientUserBanner({
  batchId,
  clientName,
  currentStep,
}: MissingClientUserBannerProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const mode = configForStep(currentStep)

  function advance() {
    setError(null)
    startTransition(async () => {
      try {
        await passBatonAction({
          batchId,
          toStep: mode.toStep,
        })
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Advance failed')
      }
    })
  }

  return (
    <Card
      size="sm"
      className="border-neutral-900/20 bg-neutral-100 px-4 py-3"
      data-component="missing-client-user-banner"
      data-step={currentStep}
    >
      <div className="flex items-start gap-3">
        <UserPlus className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="flex-1 space-y-2">
          <div className="space-y-1">
            <p className="text-[13px] font-semibold text-foreground">
              No client user linked to {clientName}
            </p>
            <p className="text-[12px] leading-snug text-muted-foreground">
              {mode.description}
            </p>
          </div>
          {error && (
            <p className="text-[12px] text-destructive">{error}</p>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={advance}
            disabled={isPending}
            className="bg-white"
          >
            {isPending ? mode.pendingLabel : mode.buttonLabel}
            <ArrowRight />
          </Button>
        </div>
      </div>
    </Card>
  )
}
