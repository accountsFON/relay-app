'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { markBatchReviewedAction, tickChecklistItemAction } from '@/server/actions/relay'
import {
  FinalQaOnceOver,
  allQaOnceOverChecked,
} from '@/components/relay/final-qa-once-over'
import { SendLinkModal } from '@/components/batch/send-link-modal'

export interface MarkReviewedChecklistItem {
  id: string
  label: string
  required: boolean
  checked: boolean
}

export interface MarkBatchReviewedButtonProps {
  batchId: string
  /** Open-thread count across all posts in the batch. Gates the trigger. */
  openThreadCount: number
  /** False when the current step has ≠1 forward edge (can't auto-advance). Default true. */
  canAdvance?: boolean
  /**
   * Review checklist items for the current step. Rendered inside the confirm
   * modal; the confirm button is gated on every required item being checked.
   */
  checklistItems?: MarkReviewedChecklistItem[]
  /** Whether the viewer may tick items (the AM holder). Default true. */
  canTick?: boolean
  /**
   * True when the client reviews this relay. Confirming opens the send-link
   * modal and only advances once the link is sent; false advances straight to
   * Scheduling.
   */
  clientReviewEnabled: boolean
  /** Client display name, passed through to the send-link modal. */
  clientName: string
  /** Client review email on file; pre-fills the send-link modal. */
  clientReviewEmail?: string | null
  /** Agency review window; seeds the review-link default expiry (P2 #23). */
  reviewWindowDays?: number
  className?: string
}

/**
 * Gated relay completion on /preview (P1 #12).
 *
 * Clicking "Mark relay reviewed" no longer advances directly -- it opens a
 * confirmation modal ("this will move it to the next step") that also renders
 * the review checklist. The confirm button is enabled only when every required
 * item is checked; `markBatchReviewedAction` re-checks threads + checklist
 * server-side. The trigger stays disabled (with a hint) while any thread is
 * open or the step can't auto-advance.
 *
 * The page only renders this at `am_review_design`, so it can't reappear at a
 * later step and advance again (the old double-click bug).
 */
export function MarkBatchReviewedButton({
  batchId,
  openThreadCount,
  canAdvance = true,
  checklistItems = [],
  canTick = true,
  clientReviewEnabled,
  clientName,
  clientReviewEmail,
  reviewWindowDays,
  className,
}: MarkBatchReviewedButtonProps) {
  const [open, setOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [checked, setChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(checklistItems.map((i) => [i.id, i.checked])),
  )
  const [qaChecked, setQaChecked] = useState<Record<number, boolean>>({})

  const gatedByThreads = openThreadCount > 0
  const gatedByBranch = canAdvance === false
  const blocked = gatedByThreads || gatedByBranch

  const requiredItems = checklistItems.filter((i) => i.required)
  const allRequiredChecked = requiredItems.every((i) => checked[i.id])

  function tick(itemId: string, value: boolean) {
    if (!canTick) return
    // Optimistic local state; roll back if the server write fails.
    setChecked((c) => ({ ...c, [itemId]: value }))
    void tickChecklistItemAction({ itemId, checked: value }).catch(() => {
      setChecked((c) => ({ ...c, [itemId]: !value }))
    })
  }

  function advance() {
    setError(null)
    startTransition(async () => {
      try {
        await markBatchReviewedAction({ batchId })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to advance relay')
      }
    })
  }

  function confirmReviewed() {
    setError(null)
    if (clientReviewEnabled) {
      // Hand off to the send-link modal; advance only once the link is sent.
      setOpen(false)
      setLinkOpen(true)
      return
    }
    setOpen(false)
    advance()
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="default"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={blocked || isPending}
        data-testid="mark-batch-reviewed-button"
        className={className}
      >
        <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
        <span>{isPending ? 'Advancing...' : 'Mark relay reviewed'}</span>
      </Button>
      {blocked && (
        <p
          data-testid="mark-batch-reviewed-hint"
          className="text-[11px] text-muted-foreground"
        >
          {gatedByThreads
            ? `Resolve ${openThreadCount} open thread${openThreadCount === 1 ? '' : 's'} to mark reviewed`
            : "This step can't auto-advance. Advance it from the relay page."}
        </p>
      )}
      {error && (
        <p
          role="alert"
          data-testid="mark-batch-reviewed-error"
          className="text-[11px] text-destructive"
        >
          {error}
        </p>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark relay reviewed?</DialogTitle>
            <DialogDescription>
              This will move the relay to the next step. Complete the review
              checklist first.
            </DialogDescription>
          </DialogHeader>
          {checklistItems.length > 0 && (
            <ul
              data-testid="mark-batch-reviewed-checklist"
              className="flex flex-col gap-2 py-1"
            >
              {checklistItems.map((item) => {
                const isChecked = Boolean(checked[item.id])
                return (
                  <li key={item.id} className="flex items-start gap-2">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isChecked}
                      aria-label={item.label}
                      disabled={!canTick}
                      onClick={() => tick(item.id, !isChecked)}
                      className={cn(
                        'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                        isChecked
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input',
                      )}
                    >
                      {isChecked && <Check className="size-3" />}
                    </button>
                    <span
                      className={cn(
                        'text-[13px]',
                        isChecked
                          ? 'text-muted-foreground line-through'
                          : 'text-foreground',
                      )}
                    >
                      {item.label}
                      {item.required && (
                        <span className="ml-1 text-[11px] text-muted-foreground">
                          (required)
                        </span>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-medium text-foreground">
              Final once-over
            </p>
            <FinalQaOnceOver
              checked={qaChecked}
              onToggle={(i, v) => setQaChecked((c) => ({ ...c, [i]: v }))}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              data-testid="mark-batch-reviewed-cancel"
            >
              No, keep reviewing
            </Button>
            <Button
              variant="default"
              onClick={confirmReviewed}
              disabled={!allRequiredChecked || !allQaOnceOverChecked(qaChecked)}
              data-testid="mark-batch-reviewed-confirm"
            >
              {clientReviewEnabled
                ? 'Send review link & advance'
                : 'Move to Scheduling'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {linkOpen && (
        <SendLinkModal
          batchId={batchId}
          clientName={clientName}
          clientReviewEmail={clientReviewEmail}
          reviewWindowDays={reviewWindowDays}
          open={linkOpen}
          onOpenChange={(o) => {
            if (!o) setLinkOpen(false)
          }}
          onSent={() => {
            setLinkOpen(false)
            startTransition(() => {
              markBatchReviewedAction({ batchId }).catch((err) =>
                setError(
                  err instanceof Error ? err.message : 'Failed to advance relay',
                ),
              )
            })
          }}
        />
      )}
    </div>
  )
}
