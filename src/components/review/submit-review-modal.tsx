'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { ReviewSessionSummary } from '@/types/review-session'

export type SubmitReviewModalProps = {
  open: boolean
  summary: ReviewSessionSummary
  pendingCount: number
  onConfirm: () => void
  onCancel: () => void
  submitting?: boolean
}

/**
 * Confirmation modal shown when the reviewer taps Submit Review.
 *
 * Two display modes:
 *   1. All posts reviewed: recap of approved / changes / edits + Confirm CTA.
 *   2. Some posts still pending: warning copy + "Submit Anyway" CTA so the
 *      reviewer can intentionally short-circuit. (Design § Submit Review.)
 *
 * Rendered conditionally; hidden when `open` is false (no portal needed since
 * the page is a single-pane mobile flow).
 */
export function SubmitReviewModal({
  open,
  summary,
  pendingCount,
  onConfirm,
  onCancel,
  submitting,
}: SubmitReviewModalProps) {
  const confirmRef = useRef<HTMLButtonElement | null>(null)

  // Focus the primary CTA when the modal opens. Keeps the keyboard flow sane
  // for clients who tab to Submit then hit Enter to confirm without grabbing
  // their mouse.
  useEffect(() => {
    if (open) {
      confirmRef.current?.focus()
    }
  }, [open])

  if (!open) return null

  const hasPending = pendingCount > 0

  return (
    <div
      data-testid="submit-review-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="submit-review-modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 sm:items-center"
      onClick={(e) => {
        // Click on backdrop = cancel
        if (e.target === e.currentTarget && !submitting) onCancel()
      }}
    >
      <div
        className={cn(
          'w-full max-w-md rounded-t-2xl bg-card p-6 shadow-2xl sm:rounded-2xl',
        )}
      >
        <h2
          id="submit-review-modal-title"
          className="text-base font-semibold text-foreground"
        >
          {hasPending ? 'Submit with pending posts?' : 'Submit review?'}
        </h2>

        {hasPending ? (
          <p className="mt-2 text-sm text-muted-foreground">
            You have{' '}
            <strong className="font-semibold text-foreground">
              {pendingCount} post{pendingCount === 1 ? '' : 's'} still pending
            </strong>
            . Submit anyway, or keep reviewing?
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            You&apos;re sending{' '}
            <strong className="font-semibold text-foreground">
              {summary.approved} approved, {summary.changesRequested} changes
              requested, {summary.captionEdited} caption edit
              {summary.captionEdited === 1 ? '' : 's'}
            </strong>{' '}
            to your team. Confirm?
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            data-testid="submit-review-modal-cancel"
            onClick={onCancel}
            disabled={submitting}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
          >
            {hasPending ? 'Keep reviewing' : 'Cancel'}
          </button>
          <button
            ref={confirmRef}
            type="button"
            data-testid="submit-review-modal-confirm"
            onClick={onConfirm}
            disabled={submitting}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting
              ? 'Submitting...'
              : hasPending
                ? 'Submit anyway'
                : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
