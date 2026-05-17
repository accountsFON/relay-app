'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ReturningReviewerBannerProps = {
  itemsReviewed: number
  totalPosts: number
  onDismiss?: () => void
  className?: string
}

/**
 * Top banner shown when a reviewer returns mid-session: they have an
 * in_progress ReviewSession with at least one saved item but have not yet
 * hit Submit Review.
 *
 * Dismisses on the first interaction (X tap or via parent flipping a flag
 * after the next decision tap). Lightweight component, no portal.
 */
export function ReturningReviewerBanner({
  itemsReviewed,
  totalPosts,
  onDismiss,
  className,
}: ReturningReviewerBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const handleDismiss = () => {
    setDismissed(true)
    onDismiss?.()
  }

  return (
    <div
      data-testid="returning-reviewer-banner"
      role="status"
      className={cn(
        'flex w-full items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-amber-900 sm:px-6',
        className,
      )}
    >
      <p className="text-[13px] leading-snug">
        <span className="font-medium">Welcome back.</span>{' '}
        <span data-testid="returning-reviewer-banner-counter">
          {itemsReviewed} of {totalPosts}
        </span>{' '}
        posts reviewed, not yet submitted. Continue where you left off.
      </p>
      <button
        type="button"
        aria-label="Dismiss"
        data-testid="returning-reviewer-banner-dismiss"
        onClick={handleDismiss}
        className="shrink-0 rounded-full p-1 text-amber-700 hover:bg-amber-100 hover:text-amber-900"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  )
}
