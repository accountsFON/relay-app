'use client'

import { cn } from '@/lib/utils'
import type { ReviewDecisionType, ReviewItemHydrated } from '@/types/review-session'

export type ReviewProgressBarProps = {
  /** Ordered post ids matching the feed order. */
  postIds: ReadonlyArray<string>
  /** Hydrated review items keyed by postId. Missing = not_reviewed. */
  itemsByPostId: Record<string, ReviewItemHydrated>
  /** Optional: index of the post currently in view (for emphasis). */
  currentPostIndex?: number
  className?: string
}

/**
 * Instagram stories segmented progress bar.
 *
 * One segment per post, each `flex-1` so the bar fills the available width.
 * Segment height is ~3px. Each segment carries a status dot below it whose
 * color reflects the per-post review decision:
 *
 *   gray   = not_reviewed
 *   green  = approved
 *   orange = changes_requested
 *   blue   = caption_edited
 *
 * The bar is purely presentational; click navigation lives in the parent
 * shell. We render a counter "N of M reviewed" above the bar so the user
 * always knows where they are.
 */

const DOT_COLOR: Record<ReviewDecisionType, string> = {
  not_reviewed: 'bg-neutral-300',
  approved: 'bg-emerald-500',
  changes_requested: 'bg-amber-500',
  caption_edited: 'bg-sky-500',
}

const SEGMENT_COLOR: Record<ReviewDecisionType, string> = {
  not_reviewed: 'bg-neutral-200',
  approved: 'bg-emerald-500',
  changes_requested: 'bg-amber-500',
  caption_edited: 'bg-sky-500',
}

function getDecision(
  postId: string,
  itemsByPostId: Record<string, ReviewItemHydrated>,
): ReviewDecisionType {
  return itemsByPostId[postId]?.decision ?? 'not_reviewed'
}

export function ReviewProgressBar({
  postIds,
  itemsByPostId,
  currentPostIndex,
  className,
}: ReviewProgressBarProps) {
  const total = postIds.length
  const reviewed = postIds.filter(
    (id) => getDecision(id, itemsByPostId) !== 'not_reviewed',
  ).length

  return (
    <div
      data-testid="review-progress-bar"
      className={cn('flex w-full flex-col gap-1.5', className)}
    >
      <div className="flex w-full items-center gap-1">
        {postIds.map((postId, idx) => {
          const decision = getDecision(postId, itemsByPostId)
          const isCurrent = idx === currentPostIndex
          return (
            <span
              key={postId}
              data-testid="review-progress-segment"
              data-decision={decision}
              data-current={isCurrent ? 'true' : 'false'}
              className={cn(
                'flex-1 rounded-full transition-colors',
                'h-[3px]',
                SEGMENT_COLOR[decision],
                isCurrent && 'ring-1 ring-foreground/40',
              )}
            />
          )
        })}
      </div>
      <div className="flex w-full items-center justify-between text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1">
          {postIds.map((postId, idx) => {
            const decision = getDecision(postId, itemsByPostId)
            return (
              <span
                key={`dot-${postId}`}
                data-testid="review-progress-dot"
                data-decision={decision}
                aria-hidden
                className={cn(
                  'inline-block size-1.5 rounded-full',
                  DOT_COLOR[decision],
                  idx === currentPostIndex && 'ring-1 ring-foreground/30',
                )}
              />
            )
          })}
        </div>
        <span data-testid="review-progress-counter">
          {reviewed}/{total} reviewed
        </span>
      </div>
    </div>
  )
}
