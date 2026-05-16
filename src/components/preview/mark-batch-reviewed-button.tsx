'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { markBatchReviewedAction } from '@/server/actions/relay'

export interface MarkBatchReviewedButtonProps {
  batchId: string
  /** Open-thread count across all posts in the batch; powers the confirm copy. */
  openThreadCount: number
  className?: string
}

/**
 * Batch-level force-advance (AM override).
 *
 * Per design § AM overrides: clicking opens a confirm dialog that warns the
 * AM about the open thread count, then on confirm calls
 * `markBatchReviewedAction` which auto-resolves every open thread with
 * `Batch force-advanced: <reason>` and advances the batch in the relay
 * state machine.
 *
 * Reason is required (matches `sendBackBaton` discipline so audit always
 * has a why).
 */
export function MarkBatchReviewedButton({
  batchId,
  openThreadCount,
  className,
}: MarkBatchReviewedButtonProps) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleOpenChange(next: boolean) {
    if (isPending) return
    setOpen(next)
    if (!next) {
      setReason('')
      setError(null)
    }
  }

  function handleConfirm() {
    const trimmed = reason.trim()
    if (trimmed.length === 0) {
      setError('Reason is required')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await markBatchReviewedAction({ batchId, reason: trimmed })
        setOpen(false)
        setReason('')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to advance batch')
      }
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="default"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="mark-batch-reviewed-button"
        className={className}
      >
        <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
        <span>Mark batch reviewed</span>
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark batch reviewed</DialogTitle>
            <DialogDescription>
              This will advance the batch in the relay workflow
              {openThreadCount > 0 ? (
                <>
                  {' '}AND auto-resolve{' '}
                  <strong data-testid="mark-batch-reviewed-thread-count">
                    {openThreadCount} open thread{openThreadCount === 1 ? '' : 's'}
                  </strong>{' '}
                  with reason{' '}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                    Batch force-advanced
                  </code>
                  . Continue?
                </>
              ) : (
                <> with no open threads to resolve. Continue?</>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-1">
            <label
              htmlFor="mark-batch-reviewed-reason"
              className="text-sm font-medium text-foreground"
            >
              Reason
            </label>
            <Textarea
              id="mark-batch-reviewed-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Client gave verbal sign-off in today's meeting"
              data-testid="mark-batch-reviewed-reason-input"
              autoFocus
              disabled={isPending}
              rows={3}
            />
            {error && (
              <p
                role="alert"
                data-testid="mark-batch-reviewed-error"
                className="text-xs text-destructive"
              >
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
              data-testid="mark-batch-reviewed-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={isPending || reason.trim().length === 0}
              data-testid="mark-batch-reviewed-confirm"
            >
              {isPending ? 'Advancing...' : 'Continue'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
