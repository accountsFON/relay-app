/**
 * ClientDecisionPanel — replaces ChecklistPanel for client-role viewers
 * at step `client_decision`. Spec § Verification step 9.
 *
 * Two affordances: Approve (→ ready_to_schedule, AM-held) or
 * Request changes (→ implementing_revisions, AM-held). Both forward
 * transitions, both routed through passBatonAction.
 *
 * Request-changes prompts for a note. The note is recorded as a
 * comment on the activity thread (not as a send-back reason, since
 * 10 → 11b is a forward transition per the state machine).
 */
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, MessageSquareWarning } from 'lucide-react'
import { RelayStep } from '@prisma/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { passBatonAction } from '@/server/actions/relay'
import { postCommentAction } from '@/app/(app)/clients/[id]/activity/actions'
import type { BatchSummary } from './types'

export interface ClientDecisionPanelProps {
  batch: BatchSummary
}

export function ClientDecisionPanel({ batch }: ClientDecisionPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mode, setMode] = useState<'idle' | 'request_changes'>('idle')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  function approve() {
    setError(null)
    startTransition(async () => {
      try {
        await passBatonAction({
          batchId: batch.id,
          toStep: RelayStep.ready_to_schedule,
        })
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Approve failed')
      }
    })
  }

  function submitRequestChanges() {
    if (note.trim().length === 0) {
      setError('Please describe what needs to change.')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await postCommentAction({
          clientId: batch.clientId,
          body: `Requesting changes on ${batch.label}: ${note.trim()}`,
        })
        await passBatonAction({
          batchId: batch.id,
          toStep: RelayStep.implementing_revisions,
        })
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Submit failed')
      }
    })
  }

  return (
    <Card size="sm" className="sticky top-4 px-4 py-4" data-component="client-decision-panel">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Your decision
        </p>
        <p className="text-[13px] text-muted-foreground">
          Approve to schedule, or request changes for your team to address.
        </p>
      </div>

      {error && (
        <p className="text-[12px] text-destructive">{error}</p>
      )}

      {mode === 'idle' && (
        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={approve} disabled={isPending} className="w-full">
            <Check />
            {isPending ? 'Approving…' : 'Approve & schedule'}
          </Button>
          <Button
            variant="outline"
            onClick={() => setMode('request_changes')}
            disabled={isPending}
            className="w-full"
          >
            <MessageSquareWarning />
            Request changes
          </Button>
        </div>
      )}

      {mode === 'request_changes' && (
        <div className="space-y-2 pt-2">
          <p className="text-[12px] font-medium text-foreground">
            What needs to change?
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-[13px]"
            placeholder="Specifics help your team turn this around faster."
            disabled={isPending}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={submitRequestChanges}
              disabled={isPending || note.trim().length === 0}
            >
              {isPending ? 'Submitting…' : 'Submit'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setMode('idle')
                setNote('')
                setError(null)
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
