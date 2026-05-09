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

import { useState } from 'react'
import { ArrowRight, ChevronDown, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  type BatchSummary,
  type ChecklistItem,
  STEP_LABEL,
} from './_placeholder-types'

export interface ChecklistPanelProps {
  batch: BatchSummary
  items: ChecklistItem[]
  /** True only for the user who matches batch.holder.id. */
  canAct: boolean
  /** Computed by the page from validateTransition. Empty array for shell. */
  legalSendBackTargets?: { step: BatchSummary['currentStep']; label: string }[]
  /** Computed next forward step from validateTransition. */
  nextStep?: BatchSummary['currentStep']
}

export function ChecklistPanel({
  batch,
  items,
  canAct,
  legalSendBackTargets = [],
  nextStep,
}: ChecklistPanelProps) {
  // Optimistic local state. Phase 3: replace with server action calls.
  const [checked, setChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(items.map((i) => [i.id, i.checked]))
  )
  const [showSendBack, setShowSendBack] = useState(false)

  const requiredItems = items.filter((i) => i.required)
  const allRequiredChecked = requiredItems.every((i) => checked[i.id])

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
                setChecked((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                // TODO Phase 3: tickItemAction(item.id, !checked)
              }}
              disabled={!canAct}
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
          <Button
            type="button"
            disabled={!allRequiredChecked || !nextStep}
            className="w-full"
            onClick={() => {
              // TODO Phase 3: passBatonAction(batch.id)
              console.log('TODO: passBatonAction', batch.id, '->', nextStep)
            }}
          >
            Pass to {nextStep ? STEP_LABEL[nextStep] : 'next step'}
            <ArrowRight />
          </Button>

          {legalSendBackTargets.length > 0 && (
            <div className="relative">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setShowSendBack((v) => !v)}
              >
                Send back
                <ChevronDown />
              </Button>
              {showSendBack && (
                <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
                  {legalSendBackTargets.map((target) => (
                    <button
                      key={target.step}
                      type="button"
                      className="block w-full rounded px-2 py-1.5 text-left text-[13px] hover:bg-accent"
                      onClick={() => {
                        setShowSendBack(false)
                        // TODO Phase 3: open SendBackModal -> sendBackBatonAction(batch.id, step, reason)
                        console.log('TODO: send back to', target.step)
                      }}
                    >
                      {target.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
