/**
 * ChecklistPanel — sticky right rail of the batch detail page.
 *
 * Spec: projects/relay-app/2026-05-09-relay-workflow-design.md § Handoff Mechanics
 *
 * Behavior (V1):
 * - Read-only for non-holders (shows progress, no checkboxes).
 * - Actionable for the current holder: tick items, watch Pass/Send-Back unlock.
 * - Pass to [Next Role] button, enabled only when every required item is checked.
 * - Send Back ▾ dropdown of legal backward targets (state-machine driven).
 *   Picking a target opens a modal demanding a reason note.
 * - All writes go through Rails server actions in src/app/(app)/api/relay/*.
 *
 * Phase: shell now. Phase 3 wires:
 *   - tickItemAction (Rails server action)
 *   - passBatonAction
 *   - sendBackBatonAction (with modal)
 *   - validateTransition() driving the Send Back dropdown options
 *
 * Schema dep: ChecklistItem[], BatchSummary, RelayStep transitions table.
 */
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RelayStep } from '@prisma/client'
import { ArrowRight, ChevronDown, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { STEP_LABEL } from './labels'
import type { BatchSummary, ChecklistItem } from './types'
import { SimpleTooltip } from './relay-tooltips'
import {
  finishBatchAction,
  passBatonAction,
  sendBackBatonAction,
  tickChecklistItemAction,
} from '@/server/actions/relay'

export interface ChecklistPanelProps {
  batch: BatchSummary
  items: ChecklistItem[]
  /** True only for the user who matches batch.holder.id. */
  canAct: boolean
  /** Computed by the page from validateTransition. Empty array for shell. */
  legalSendBackTargets?: { step: RelayStep; label: string }[]
  /** Computed next forward step from validateTransition. */
  nextStep?: RelayStep
}

export function ChecklistPanel({
  batch,
  items,
  canAct,
  legalSendBackTargets = [],
  nextStep,
}: ChecklistPanelProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(items.map((i) => [i.id, i.checked]))
  )
  const [sendBackTarget, setSendBackTarget] = useState<RelayStep | null>(null)
  const [reasonText, setReasonText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const requiredItems = items.filter((i) => i.required)
  const allRequiredChecked = requiredItems.every((i) => checked[i.id])

  function tick(itemId: string, value: boolean) {
    setChecked((prev) => ({ ...prev, [itemId]: value }))
    startTransition(async () => {
      try {
        await tickChecklistItemAction({ itemId, checked: value })
        router.refresh()
      } catch (e) {
        setChecked((prev) => ({ ...prev, [itemId]: !value }))
        setError(e instanceof Error ? e.message : 'Failed to update')
      }
    })
  }

  function pass() {
    if (!nextStep) return
    startTransition(async () => {
      try {
        await passBatonAction({ batchId: batch.id, toStep: nextStep })
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Pass failed')
      }
    })
  }

  function finish() {
    startTransition(async () => {
      try {
        await finishBatchAction({ batchId: batch.id })
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Finish failed')
      }
    })
  }

  const isFinishStep = nextStep === RelayStep.completed

  function confirmSendBack() {
    if (!sendBackTarget || reasonText.trim().length === 0) return
    startTransition(async () => {
      try {
        await sendBackBatonAction({
          batchId: batch.id,
          toStep: sendBackTarget,
          reason: reasonText.trim(),
        })
        setSendBackTarget(null)
        setReasonText('')
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Send-back failed')
      }
    })
  }

  return (
    <Card size="sm" className="sticky top-4 px-4 py-4" data-component="checklist-panel">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Checklist
        </p>
        <p className="text-[13px] text-muted-foreground">
          {STEP_LABEL[batch.currentStep]} · held by {batch.holder.name}
        </p>
      </div>

      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => {
                if (!canAct) return
                tick(item.id, !checked[item.id])
              }}
              disabled={!canAct || isPending}
              className={cn(
                'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border',
                checked[item.id]
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background',
                !canAct && 'cursor-not-allowed opacity-60'
              )}
              aria-label={checked[item.id] ? 'Uncheck item' : 'Check item'}
            >
              {checked[item.id] && <Check className="size-3" />}
            </button>
            <span
              className={cn(
                'text-[13px] leading-tight',
                checked[item.id] ? 'text-muted-foreground line-through' : 'text-foreground'
              )}
            >
              {item.label}
              {item.required && (
                <span className="ml-1 text-[10px] uppercase text-muted-foreground">
                  required
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {canAct && (
        <div className="space-y-2 pt-3">
          {error && (
            <p className="text-[11px] text-destructive">{error}</p>
          )}
          {isFinishStep ? (
            <SimpleTooltip content="Mark this relay finished. Archive it later from the My Relay dashboard.">
              <Button
                type="button"
                disabled={!allRequiredChecked || isPending}
                className="w-full"
                onClick={finish}
              >
                {isPending ? 'Finishing…' : 'Finish'}
                <Check />
              </Button>
            </SimpleTooltip>
          ) : (
            <SimpleTooltip content="Hand the baton to the next person on the relay.">
              <Button
                type="button"
                disabled={!allRequiredChecked || !nextStep || isPending}
                className="w-full"
                onClick={pass}
              >
                {isPending ? 'Passing…' : `Pass to ${nextStep ? STEP_LABEL[nextStep] : 'next step'}`}
                <ArrowRight />
              </Button>
            </SimpleTooltip>
          )}

          {legalSendBackTargets.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-cream-warm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                aria-label="Send back"
                title="Send this relay back to a previous step. Add a reason for the recipient."
              >
                Send back
                <ChevronDown className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[12rem]">
                {legalSendBackTargets.map((target) => (
                  <DropdownMenuItem
                    key={target.step}
                    onClick={() => setSendBackTarget(target.step)}
                  >
                    {target.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {sendBackTarget && (
            <div className="space-y-2 rounded-md border border-ink/20 bg-cream-warm p-3">
              <p className="text-[12px] font-medium text-foreground">
                Sending back to {STEP_LABEL[sendBackTarget]}. Required reason:
              </p>
              <textarea
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                rows={3}
                className="w-full rounded border border-border bg-background px-2 py-1 text-[13px]"
                placeholder="Why are you sending this back?"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={confirmSendBack}
                  disabled={isPending || reasonText.trim().length === 0}
                >
                  {isPending ? 'Sending…' : 'Confirm send-back'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSendBackTarget(null)
                    setReasonText('')
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
