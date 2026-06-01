/**
 * CopySubStatePanel: renders the AM-side affordance at step `copy`,
 * keyed off the sub-state. Bridges the Batch model to the existing
 * generation flow at /clients/[id]/generate.
 *
 *   generating → "Generate copy" link to the existing run flow
 *   drafted    → "Mark drafted as approved" sub-state advance
 *   approved   → returns null so ChecklistPanel handles the Pass
 */
'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Sparkles, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { advanceCopySubStateAction } from '@/server/actions/relay'

export interface CopySubStatePanelProps {
  batchId: string
  clientId: string
  label: string
  subState: string | null
  canAct: boolean
}

export function CopySubStatePanel({
  batchId,
  clientId,
  label,
  subState,
  canAct,
}: CopySubStatePanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const sub = subState ?? 'generating'

  if (sub === 'approved') return null

  function approveDraft() {
    setError(null)
    startTransition(async () => {
      try {
        await advanceCopySubStateAction({ batchId, toSubState: 'approved' })
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to approve')
      }
    })
  }

  return (
    <Card size="sm" className="px-4 py-3" data-component="copy-substate-panel">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Copy stage · {sub}
      </p>

      {sub === 'generating' && canAct && (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-[12px] text-muted-foreground">
            Trigger the generator to draft this batch&apos;s copy. Posts get attached to this batch automatically.
          </p>
          <Link
            href={`/clients/${clientId}/generate?targetMonth=${encodeURIComponent(label)}`}
          >
            <Button className="w-full">
              <Sparkles />
              Generate copy
            </Button>
          </Link>
        </div>
      )}

      {sub === 'drafted' && canAct && (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-[12px] text-muted-foreground">
            Copy is drafted. Review the posts grid; mark approved when ready to pass to design.
          </p>
          <Button onClick={approveDraft} disabled={isPending} className="w-full">
            <Check />
            {isPending ? 'Approving…' : 'Mark drafted as approved'}
          </Button>
          {error && <p className="text-[11px] text-destructive">{error}</p>}
        </div>
      )}

      {sub === 'generating' && !canAct && (
        <p className="mt-2 text-[12px] text-muted-foreground">
          Waiting on the AM to generate copy.
        </p>
      )}

      {sub === 'drafted' && !canAct && (
        <p className="mt-2 text-[12px] text-muted-foreground">
          Copy drafted. Waiting on AM review.
        </p>
      )}
    </Card>
  )
}
