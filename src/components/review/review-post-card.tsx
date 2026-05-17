'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { InstagramFeedPost } from '@/components/preview/instagram-post'
import { FacebookPost } from '@/components/preview/facebook-post'
import type { Platform } from '@/components/preview/platform-toggle'
import type { FeedPostProps } from '@/types/preview'
import type { ReviewDecisionType, ReviewItemHydrated } from '@/types/review-session'
import { DecisionButtonRow } from './decision-button-row'

export type ReviewPostCardProps = {
  post: FeedPostProps['post']
  clientName: string
  clientAvatarUrl?: string | null
  reviewItem?: ReviewItemHydrated
  platform: Platform
  /** Only 'review' is supported on the v2 client surface. */
  mode: 'review'
  onDecisionChange: (decision: ReviewDecisionType) => void
  onCommentChange: (comment: string) => void
  onCaptionEditStart?: () => void
  disabled?: boolean
  className?: string
}

/**
 * Per-post card on the v2 client review surface. Composes the existing
 * InstagramFeedPost / FacebookPost in mode='review' with no `onCreateThread`
 * (v2 surface bundles feedback into the session, not per-pin threads), then
 * stacks the decision row + comment textarea + caption-edit hint below.
 *
 * When the reviewItem decision is `caption_edited`, a small "Suggested edit"
 * badge sits above the decision row so the reviewer remembers they suggested
 * something on this post.
 *
 * The "Updated since your last review" banner sits above everything else for
 * round 2+ when the AM has edited the post between sessions.
 */
export function ReviewPostCard({
  post,
  clientName,
  clientAvatarUrl,
  reviewItem,
  platform,
  mode,
  onDecisionChange,
  onCommentChange,
  onCaptionEditStart,
  disabled,
  className,
}: ReviewPostCardProps) {
  const decision = reviewItem?.decision ?? 'not_reviewed'
  const isUpdated = reviewItem?.updatedSinceLastReview ?? false
  const hasCaptionEdit = decision === 'caption_edited'

  // Local controlled comment, mirrored to parent on blur to avoid a PATCH
  // per keystroke. Initialized from the reviewItem so re-renders carry
  // server-saved drafts.
  const [comment, setComment] = useState(reviewItem?.comment ?? '')
  const [focused, setFocused] = useState(false)

  const commentPlaceholder =
    decision === 'changes_requested'
      ? 'Tell the team what to change'
      : 'Add a comment (optional)'

  // Empty threads array: v2 surface intentionally bypasses the per-pin
  // markup model. The IG/FB post components hide all markup affordances
  // when no onCreateThread callback is passed.
  const PostComponent = platform === 'instagram' ? InstagramFeedPost : FacebookPost

  return (
    <article
      data-testid="review-post-card"
      data-post-id={post.id}
      data-decision={decision}
      className={cn(
        'flex w-full flex-col gap-3',
        isUpdated && 'rounded-xl ring-2 ring-amber-300',
        className,
      )}
    >
      {isUpdated ? (
        <div
          data-testid="review-post-card-updated-banner"
          role="status"
          className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-900"
        >
          <span aria-hidden>●</span>
          <span>Updated since your last review</span>
        </div>
      ) : null}

      <PostComponent
        post={post}
        client={{ name: clientName, avatarUrl: clientAvatarUrl ?? null }}
        threads={[]}
        mode={mode}
      />

      {hasCaptionEdit ? (
        <button
          type="button"
          data-testid="review-post-card-edit-hint"
          onClick={onCaptionEditStart}
          className="inline-flex w-fit items-center gap-1.5 rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-medium text-sky-800 hover:bg-sky-200"
        >
          <span aria-hidden>✎</span>
          <span>Suggested edit · tap to edit</span>
        </button>
      ) : null}

      <DecisionButtonRow
        value={decision}
        onChange={onDecisionChange}
        disabled={disabled}
      />

      <label
        className="block text-[12px] font-medium text-muted-foreground"
        htmlFor={`comment-${post.id}`}
      >
        <span className="sr-only">Comment for this post</span>
        <textarea
          id={`comment-${post.id}`}
          data-testid="review-post-card-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            // Only fire change if the value differs from what the parent
            // already has, avoids a no-op PATCH on every blur.
            if ((reviewItem?.comment ?? '') !== comment) {
              onCommentChange(comment)
            }
          }}
          placeholder={commentPlaceholder}
          rows={focused || comment.length > 0 ? 3 : 1}
          disabled={disabled}
          className={cn(
            'mt-1 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-[height,border-color] focus:border-primary disabled:cursor-not-allowed disabled:opacity-60',
          )}
        />
      </label>
    </article>
  )
}
