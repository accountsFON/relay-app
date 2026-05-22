'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
  /**
   * Persist a saved suggested caption. Called when the reviewer hits Save in
   * the inline caption editor. Triggers a PATCH on `/api/review/[token]/draft`
   * with `{ decision: 'caption_edited', suggestedCaption: draft }`.
   */
  onCaptionEditSave?: (draft: string) => Promise<void> | void
  disabled?: boolean
  className?: string
}

/**
 * Per-post card on the v2 client review surface. Composes the existing
 * InstagramFeedPost / FacebookPost in mode='review' (no `onCreateThread`
 * because v2 bundles feedback into the session, not per-pin threads), then
 * stacks the decision row + comment textarea below.
 *
 * Caption-edit lives inline inside the platform chrome:
 *   - Tapping Edit Copy in the decision row enters edit mode. The card
 *     snapshots the prior decision so Cancel can revert.
 *   - Save calls `onCaptionEditSave(draft)` which the shell wires to the
 *     existing draft endpoint, then exits edit mode.
 *   - Cancel exits edit mode and restores the prior decision.
 *   - When the reviewer has a saved suggestedCaption and is not editing,
 *     the chrome renders the suggestion (via `captionOverride`) with a
 *     `view original / back to your edit` peek toggle.
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
  onCaptionEditSave,
  disabled,
  className,
}: ReviewPostCardProps) {
  const decision = reviewItem?.decision ?? 'not_reviewed'
  const isUpdated = reviewItem?.updatedSinceLastReview ?? false
  const savedSuggestion = reviewItem?.suggestedCaption ?? null

  // Local controlled comment, mirrored to parent on blur to avoid a PATCH
  // per keystroke. Initialized from the reviewItem so re-renders carry
  // server-saved drafts.
  const [comment, setComment] = useState(reviewItem?.comment ?? '')
  const [focused, setFocused] = useState(false)

  // Caption edit state.
  const [isEditing, setIsEditing] = useState(false)
  const [captionDraft, setCaptionDraft] = useState<string>(
    savedSuggestion ?? post.caption,
  )
  // Snapshot of the decision before the reviewer tapped Edit Copy, so Cancel
  // can restore it. Captured at edit-mode entry.
  const decisionBeforeEditRef = useRef<ReviewDecisionType | null>(null)

  const articleRef = useRef<HTMLElement | null>(null)

  // When edit mode opens, scroll the card into view so the inline textarea
  // is visible above any on-screen keyboard.
  useEffect(() => {
    if (!isEditing) return
    const el = articleRef.current
    if (!el) return
    try {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    } catch {
      // jsdom + older browsers may not implement scrollIntoView options.
    }
  }, [isEditing])

  const enterEditMode = useCallback(() => {
    decisionBeforeEditRef.current = decision
    setCaptionDraft(savedSuggestion ?? post.caption)
    setIsEditing(true)
  }, [decision, savedSuggestion, post.caption])

  const exitEditMode = useCallback(() => {
    setIsEditing(false)
    decisionBeforeEditRef.current = null
  }, [])

  const handleDecisionChange = useCallback(
    (next: ReviewDecisionType) => {
      if (next === 'caption_edited') {
        // Tapping Edit Copy is both the decision and the gesture that opens
        // the editor. Capture the prior decision first so Cancel can revert.
        if (!isEditing) {
          decisionBeforeEditRef.current = decision
        }
        setCaptionDraft(savedSuggestion ?? post.caption)
        setIsEditing(true)
        onDecisionChange(next)
        return
      }
      // Any other decision exits edit mode (no draft to preserve in this
      // path) and forwards to the parent.
      if (isEditing) {
        exitEditMode()
      }
      onDecisionChange(next)
    },
    [
      isEditing,
      decision,
      savedSuggestion,
      post.caption,
      onDecisionChange,
      exitEditMode,
    ],
  )

  const handleCaptionEditSave = useCallback(async () => {
    if (!onCaptionEditSave) {
      exitEditMode()
      return
    }
    await onCaptionEditSave(captionDraft)
    exitEditMode()
  }, [captionDraft, onCaptionEditSave, exitEditMode])

  const handleCaptionEditCancel = useCallback(() => {
    const prior = decisionBeforeEditRef.current
    exitEditMode()
    // If the reviewer hadn't already had `caption_edited` selected before
    // this round of editing, revert the decision to whatever they had.
    if (prior !== null && prior !== 'caption_edited') {
      onDecisionChange(prior)
    }
  }, [exitEditMode, onDecisionChange])

  const commentPlaceholder =
    decision === 'changes_requested'
      ? 'Tell the team what to change'
      : 'Add a comment (optional)'

  // Empty threads array: v2 surface intentionally bypasses the per-pin
  // markup model. The IG/FB post components hide all markup affordances
  // when no onCreateThread callback is passed.
  const PostComponent = platform === 'instagram' ? InstagramFeedPost : FacebookPost

  // captionOverride is set whenever a saved suggestion exists, even when
  // the current decision was reverted away from `caption_edited` (the
  // reviewer can re-enter Edit Copy and the textarea will pre-fill with
  // the prior suggestion). Suppress override while editing so the textarea
  // is the only caption surface visible.
  const captionOverride =
    !isEditing && savedSuggestion !== null && decision === 'caption_edited'
      ? savedSuggestion
      : undefined

  return (
    <article
      ref={articleRef}
      data-testid="review-post-card"
      data-post-id={post.id}
      data-decision={decision}
      data-editing={isEditing ? 'true' : 'false'}
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
        editing={isEditing}
        captionDraft={isEditing ? captionDraft : undefined}
        onCaptionDraftChange={isEditing ? setCaptionDraft : undefined}
        onCaptionEditSave={isEditing ? handleCaptionEditSave : undefined}
        onCaptionEditCancel={isEditing ? handleCaptionEditCancel : undefined}
        captionOverride={captionOverride}
      />

      <DecisionButtonRow
        value={decision}
        onChange={handleDecisionChange}
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
