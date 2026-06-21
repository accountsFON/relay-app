/**
 * ChecklistPanel: sticky right rail of the batch detail page.
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
import { AdminForceStepSection } from './admin-force-step-section'
import { ClientReviewEmailModal } from '@/components/relay/client-review-email-modal'
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
  /**
   * True only for admin role and platform owner. Reveals the Admin tools
   * section that force-moves the batch to any step. Stricter than canAct
   * (AMs do NOT get force step).
   */
  canForceStep?: boolean
  /**
   * More than one legal forward step (e.g. step 10 revisions: re-review vs
   * schedule). When length > 1, the panel renders one forward button per
   * target instead of the single nextStep button. The server still validates
   * every transition.
   */
  legalForwardTargets?: { step: RelayStep; label: string }[]
  /**
   * The client's review email on file (Client.clientReviewEmail). When passing
   * INTO client review with no email here, the panel intercepts with a modal
   * instead of passing directly.
   */
  clientReviewEmail?: string | null
  /** Client display name, used as the magic-link recipient name in the modal. */
  clientName?: string
}

export function ChecklistPanel({
  batch,
  items,
  canAct,
  legalSendBackTargets = [],
  nextStep,
  canForceStep = false,
  legalForwardTargets,
  clientReviewEmail,
  clientName,
}: ChecklistPanelProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(items.map((i) => [i.id, i.checked]))
  )
  const [sendBackTarget, setSendBackTarget] = useState<RelayStep | null>(null)
  const [reviewEmailModalStep, setReviewEmailModalStep] = useState<RelayStep | null>(null)
  const [reasonText, setReasonText] = useState('')
  const [error, setError] = useState<string | null>(null)
  // `isActing` gates the destructive state-machine actions (pass / finish /
  // send-back) only. Ticking a checklist item is intentionally NOT in this
  // transition: a tick is optimistic local state, so the Pass button can
  // enable the instant the last required item is checked instead of waiting
  // on a save + full-page refresh. See tick() below.
  const [isActing, startActing] = useTransition()
  const router = useRouter()

  const requiredItems = items.filter((i) => i.required)
  const allRequiredChecked = requiredItems.every((i) => checked[i.id])

  function tick(itemId: string, value: boolean) {
    // Optimistic local state drives the UI immediately. We deliberately do
    // NOT call router.refresh() here: the checklist panel owns its checked
    // state (the server `items` only seed it once), nothing else on the
    // batch page renders checklist-completion state, and tickChecklistItemAction
    // already revalidatePath()s for the next navigation. A per-tick refresh
    // would re-render the heavy batch detail page for no visible change while
    // blocking the Pass button until it settled.
    setChecked((prev) => ({ ...prev, [itemId]: value }))
    void tickChecklistItemAction({ itemId, checked: value }).catch((e) => {
      setChecked((prev) => ({ ...prev, [itemId]: !value }))
      setError(e instanceof Error ? e.message : 'Failed to update')
    })
  }

  /**
   * Passing INTO client review requires a client review email so the magic
   * link has somewhere to go. If the client has none on file, intercept with
   * the modal instead of passing; it captures the email, sends the link
   * (which also persists the email), then passes.
   */
  function needsReviewEmail(toStep: RelayStep): boolean {
    return toStep === RelayStep.sent_to_client && !clientReviewEmail
  }

  function pass() {
    if (!nextStep) return
    if (needsReviewEmail(nextStep)) {
      setReviewEmailModalStep(nextStep)
      return
    }
    startActing(async () => {
      try {
        await passBatonAction({ batchId: batch.id, toStep: nextStep })
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Pass failed')
      }
    })
  }

  function passTo(toStep: RelayStep) {
    if (needsReviewEmail(toStep)) {
      setReviewEmailModalStep(toStep)
      return
    }
    startActing(async () => {
      try {
        await passBatonAction({ batchId: batch.id, toStep })
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Pass failed')
      }
    })
  }

  function finish() {
    startActing(async () => {
      try {
        await finishBatchAction({ batchId: batch.id })
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Finish failed')
      }
    })
  }

  const isFinishStep = nextStep === RelayStep.completed

  /**
   * Phase 3 item 16: smart skip CTA on AM review.
   *
   * The state machine forward edge from `am_review_design` already lands on
   * `am_qa_pre_client` (the "skip designer revisions" path is the forward
   * transition, send-back is the revisions path). The wiring exists; this is
   * a copy override so the AM sees a destination-named label instead of the
   * internal step name "Pre-client QA".
   *
   *   am_review_design + clientReviewEnabled  -> "Send to client review"
   *   am_review_design + no client review     -> "Send to final QA"
   *   anything else                           -> "Pass to ${STEP_LABEL[nextStep]}"
   *
   * Server still validates the transition via LEGAL_TRANSITIONS in
   * passBatonAction, so a stale UI cannot bypass the state machine.
   */
  function passButtonLabel(): string {
    if (!nextStep) return ''
    if (batch.currentStep === RelayStep.am_review_design) {
      return batch.clientReviewEnabled
        ? 'Send to client review'
        : 'Send to final QA'
    }
    return `Pass to ${STEP_LABEL[nextStep]}`
  }

  function confirmSendBack() {
    if (!sendBackTarget || reasonText.trim().length === 0) return
    startActing(async () => {
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
              disabled={!canAct || isActing}
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
          {legalForwardTargets && legalForwardTargets.length > 1 ? (
            <div className="space-y-2">
              {legalForwardTargets.map((t) => (
                <Button
                  key={t.step}
                  type="button"
                  disabled={!allRequiredChecked || isActing}
                  className="w-full"
                  onClick={() => passTo(t.step)}
                >
                  {t.label}
                  <ArrowRight />
                </Button>
              ))}
            </div>
          ) : isFinishStep ? (
            <SimpleTooltip content="Mark this relay finished. Archive it later from the My Relay dashboard.">
              <Button
                type="button"
                disabled={!allRequiredChecked || isActing}
                className="w-full"
                onClick={finish}
              >
                {isActing ? 'Finishing…' : 'Finish'}
                <Check />
              </Button>
            </SimpleTooltip>
          ) : nextStep ? (
            <SimpleTooltip content="Hand the baton to the next person on the relay.">
              <Button
                type="button"
                disabled={!allRequiredChecked || isActing}
                className="w-full"
                onClick={pass}
              >
                {isActing ? 'Passing…' : passButtonLabel()}
                <ArrowRight />
              </Button>
            </SimpleTooltip>
          ) : null}

          {legalSendBackTargets.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
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
            <div className="space-y-2 rounded-md border border-neutral-900/20 bg-neutral-100 p-3">
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
                  disabled={isActing || reasonText.trim().length === 0}
                >
                  {isActing ? 'Sending…' : 'Confirm send back'}
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

          <AdminForceStepSection
            batchId={batch.id}
            currentStep={batch.currentStep}
            canForceStep={canForceStep}
          />
        </div>
      )}

      {reviewEmailModalStep && (
        <ClientReviewEmailModal
          open
          onOpenChange={(o) => {
            if (!o) setReviewEmailModalStep(null)
          }}
          batchId={batch.id}
          clientName={clientName ?? batch.label}
          toStep={reviewEmailModalStep}
          onComplete={() => {
            setReviewEmailModalStep(null)
            router.refresh()
          }}
        />
      )}
    </Card>
  )
}
