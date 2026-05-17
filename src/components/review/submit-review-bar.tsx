'use client'

import { cn } from '@/lib/utils'
import type { ReviewSessionSummary } from '@/types/review-session'

export type SubmitReviewBarProps = {
  summary: ReviewSessionSummary
  onSubmit: () => void
  submitting?: boolean
  className?: string
}

/**
 * Sticky bottom CTA for the v2 client review surface.
 *
 * Uses `position: sticky` with `bottom: 0` so it floats above the scrolling
 * feed without leaving the document flow (which keeps it behaved on iOS
 * Safari where `position: fixed` interacts badly with the dynamic toolbar).
 *
 * The live counter chip mirrors the bottom progress info from the design
 * doc: "8 approved · 4 changes · 1 edit". It updates on every decision tap
 * because the parent re-passes a fresh `summary` prop.
 */
export function SubmitReviewBar({
  summary,
  onSubmit,
  submitting,
  className,
}: SubmitReviewBarProps) {
  const { approved, changesRequested, captionEdited } = summary

  return (
    <div
      data-testid="submit-review-bar"
      className={cn(
        'sticky bottom-0 z-30 w-full border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80',
        className,
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-2 px-4 py-3 sm:px-6">
        <div
          data-testid="submit-review-bar-counter"
          className="flex items-center justify-center gap-2 text-[12px] text-muted-foreground"
        >
          <span data-testid="counter-approved">{approved} approved</span>
          <span aria-hidden>·</span>
          <span data-testid="counter-changes">{changesRequested} changes</span>
          <span aria-hidden>·</span>
          <span data-testid="counter-edits">{captionEdited} edits</span>
        </div>
        <button
          type="button"
          data-testid="submit-review-bar-button"
          onClick={onSubmit}
          disabled={submitting}
          className={cn(
            'inline-flex w-full items-center justify-center rounded-full bg-primary px-6 text-[14px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60',
            'min-h-[44px]',
          )}
        >
          {submitting ? 'Submitting...' : 'Submit Review'}
        </button>
      </div>
    </div>
  )
}
