'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { InstagramFeedPost } from '@/components/preview/instagram-post'
import { FacebookPost } from '@/components/preview/facebook-post'
import type { Platform } from '@/components/preview/platform-toggle'
import type { FeedPostProps } from '@/types/preview'
import type { PinLocation } from '@/types/preview'
import type { ReviewDecisionType, ReviewItemHydrated } from '@/types/review-session'
import { DecisionButtonRow } from './decision-button-row'
import { useUnsavedChanges } from '@/lib/unsaved-changes'

export type ReviewPostCardProps = {
  post: FeedPostProps['post']
  clientName: string
  clientAvatarUrl?: string | null
  reviewItem?: ReviewItemHydrated
  /**
   * Hydrated threads on the post (image pins, caption-range pins,
   * post-level threads). Passed through to the IG/FB chrome so the
   * markup overlay can render existing reviewer pins as numbered badges.
   * Defaults to an empty array.
   */
  threads?: FeedPostProps['threads']
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
  /**
   * Drop a new reviewer pin on the post (image, caption-range, or
   * post-level). When omitted, the markup overlay + caption-selection
   * composer hide their drop-a-pin affordances. Wired to the
   * `leaveCommentAsReviewer` server action by the shell.
   */
  onCreatePin?: (
    pin: PinLocation,
    body: string,
    image?: { url: string; width?: number; height?: number },
  ) => Promise<void>
  /**
   * Append a comment to an existing thread on this post. Wired to
   * `addCommentAsReviewer` by the shell. When omitted, the pin popover
   * hides the reply affordance.
   */
  onAppendThreadComment?: (
    threadId: string,
    body: string,
    image?: { url: string; width?: number; height?: number },
  ) => Promise<void>
  /**
   * When provided, renders an "Attach image" button in both pin composers.
   * The host passes uploadCommentImage partially applied with the reviewer's
   * identity so the component stays identity-agnostic.
   */
  onUploadImage?: (file: File) => Promise<{ url: string; width: number; height: number }>
  disabled?: boolean
  className?: string
}

/**
 * Per-post card on the v2 client review surface. Composes the existing
 * InstagramFeedPost / FacebookPost in mode='review' with image markup
 * pins enabled (Phase 4 item 22), then stacks the decision row + Notes
 * textarea below.
 *
 * Feedback gestures, in order of specificity:
 *   - Pin on the image or caption -> persists as a PostThread row with
 *     author.kind = 'reviewer' via `onCreatePin`. The AM digest renders
 *     these inline alongside per-item decisions.
 *   - Edit Copy on the caption -> inline textarea, persists as
 *     suggestedCaption via `onCaptionEditSave`.
 *   - Decision row (Approve / Request Changes / Edit Copy) -> the verdict.
 *   - Notes textarea -> catch-all for cross-cutting context that does not
 *     fit a pin or a decision.
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
  threads,
  platform,
  mode,
  onDecisionChange,
  onCommentChange,
  onCaptionEditSave,
  onCreatePin,
  onAppendThreadComment,
  onUploadImage,
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
  useUnsavedChanges(isEditing && captionDraft !== (savedSuggestion ?? post.caption))
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

  // Per Phase 4 item 22: unified placeholder regardless of decision.
  // The decision-specific "Tell the team what to change" placeholder is
  // removed -- Request Changes leans on image/caption pins for the
  // primary "what to change" affordance, and Notes is the residual
  // catch-all for cross-cutting context.
  const commentPlaceholder =
    'Anything else? Tag people, ask questions, leave context.'

  // Phase 4 item 22: image/caption pins are now enabled on the client
  // review surface. Threads hydrate from the page query; new pins flow
  // through `onCreatePin` -> `leaveCommentAsReviewer` server action,
  // which persists a PostThread with author.kind = 'reviewer'.
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
        threads={threads ?? []}
        mode={mode}
        onCreateThread={onCreatePin}
        onComment={onAppendThreadComment}
        onUploadImage={onUploadImage}
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

      {decision === 'changes_requested' ? (
        <p
          data-testid="review-post-card-changes-hint"
          className="text-[12px] text-muted-foreground"
        >
          Pin the parts of the image or caption that need changes, or use Notes
          below for general comments.
        </p>
      ) : null}

      <label
        className="block text-[12px] font-medium text-muted-foreground"
        htmlFor={`comment-${post.id}`}
      >
        <span data-testid="review-post-card-notes-label">Notes (optional)</span>
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
