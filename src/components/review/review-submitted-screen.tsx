'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReviewSessionSummary } from '@/types/review-session'

export type ReviewSubmittedScreenProps = {
  summary: ReviewSessionSummary
  amName: string
  className?: string
}

/**
 * Post-submit thanks screen. Replaces the review surface entirely once the
 * client confirms submission.
 *
 * Renders:
 *   - big checkmark
 *   - "Sent" header + "Your team has been notified."
 *   - the same summary recap the modal showed
 *   - AM name + reply-by-email hint (the digest the AM receives has
 *     Reply-To set to the client's email, so this messaging holds)
 */
export function ReviewSubmittedScreen({
  summary,
  amName,
  className,
}: ReviewSubmittedScreenProps) {
  return (
    <div
      data-testid="review-submitted-screen"
      className={cn(
        'mx-auto flex w-full max-w-[480px] flex-col items-center px-6 py-12 text-center',
        className,
      )}
    >
      <span className="flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
        <Check aria-hidden className="size-8" />
      </span>

      <h1 className="mt-6 text-2xl font-semibold text-foreground">Sent</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your team has been notified.
      </p>

      <div
        data-testid="review-submitted-summary"
        className="mt-6 grid w-full grid-cols-3 gap-2 rounded-xl border border-border bg-card p-4"
      >
        <div className="flex flex-col items-center">
          <span className="text-xl font-semibold text-emerald-600">
            {summary.approved}
          </span>
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Approved
          </span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-xl font-semibold text-amber-600">
            {summary.changesRequested}
          </span>
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Changes
          </span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-xl font-semibold text-sky-600">
            {summary.captionEdited}
          </span>
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Edits
          </span>
        </div>
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{amName}</span> will be in
        touch. Reply to the confirmation email to message them directly.
      </p>
    </div>
  )
}
