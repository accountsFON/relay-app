'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { InstagramFeedPost } from '@/components/preview/instagram-post'
import { FacebookPost } from '@/components/preview/facebook-post'
import { CommentThread } from '@/components/preview/comment-thread'
import type { Platform } from '@/components/preview/platform-toggle'
import type { FeedPostProps } from '@/types/preview'
import type { PinLocation } from '@/types/preview'
import type { ReviewDecisionType, ReviewItemHydrated } from '@/types/review-session'
import type { MentionTarget } from '@/lib/mentions'
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
  /**
   * 'review' = magic-link client surface. Renders the full verdict row (Approve
   * / Changes), Notes field, Edit-copy affordance (gated on verdictLocked), and
   * pin chrome. The host shell wires callbacks to the token draft endpoint.
   *
   * 'internal' = Clerk-authed AM surface on /preview. Markup-only: renders pins
   * and the Edit-copy affordance (gated on `canEditCaption`). The verdict row
   * and Notes field are NOT rendered. The host shell is responsible for any
   * internal persistence.
   *
   * Passed straight through to the embedded IG/FB chrome (`FeedPostProps.mode`).
   */
  mode: 'review' | 'internal'
  onDecisionChange?: (decision: ReviewDecisionType) => void
  onCommentChange: (comment: string) => Promise<boolean>
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
  /**
   * AM-only (internal mode). Resolve a pin/thread from the feed popover. The
   * shell wires this to `resolveThreadAction`. Forwarded straight to the IG/FB
   * chrome, which itself gates the resolve affordance on `mode === 'internal'`,
   * so passing it in `mode='review'` is a no-op. Omitted on the client surface.
   */
  onResolveThread?: (threadId: string) => Promise<void>
  /**
   * AM-only (internal mode). Promote a comment's attached image to the post
   * media. The shell wires this to `useCommentImageAsPostMediaAction`. The
   * chrome gates the affordance on `mode === 'internal'`.
   */
  onUseAsPostImage?: (commentId: string) => Promise<void>
  /**
   * Internal @-mention roster (AM + designer + admins) for the new-pin draft
   * composer and the pin reply popover autocomplete. Defaulted to [] so the
   * client `mode='review'` surface (which passes no roster) shows no
   * autocomplete and is unchanged.
   */
  mentionRoster?: MentionTarget[]
  /**
   * AM-only (internal mode). When true, the inline "Edit copy" affordance is
   * offered; when false, it is hidden. Only relevant in mode='internal'.
   * Defaults to true so existing callers that do not pass it retain the
   * current behaviour. Ignored in mode='review' (the client surface always
   * gates Edit copy on `verdictLocked` only).
   */
  canEditCaption?: boolean
  /**
   * When false, the post-level pin composer (the "start a discussion" thread
   * starter on a locked post with no existing thread) is hidden. Image-pin
   * markup overlay and reply popovers are unaffected — designers keep those.
   * Defaults to true so existing callers retain the current behaviour.
   */
  allowPostPins?: boolean
  /**
   * AM-only (internal mode). When true, the embedded IG/FB chrome offers the
   * drag/click "Replace image" affordance over the post media. Gated upstream
   * on the `post.media.edit` permission (admin/AM/designer true, client false).
   * Defaults to false so existing callers (and the client review surface) are
   * unchanged. Forwarded to the platform post as `canReplaceImage`. The replace
   * affordance is a corner button for both roles, so it never occludes pins.
   */
  canReplaceImage?: boolean
  /**
   * Transient disable (e.g. an in-flight save) — greys the verdict row and the
   * Notes field. Pins/threads stay live.
   */
  disabled?: boolean
  /**
   * Permanent verdict lock applied once the session is submitted. Composes
   * with `disabled`: the verdict row and inline "Edit copy" become unavailable
   * and the Notes field becomes read-only (but readable at full opacity). Pins
   * and thread replies stay live so the client can keep the conversation going
   * with the AM.
   */
  locked?: boolean
  /**
   * When true, renders a "New reply" badge at the top of the card. Computed
   * server-side from the per-reviewer `repliesSeenAt`: true when an AM has
   * replied to one of this client's threads since the reviewer last visited.
   */
  hasNewReply?: boolean
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
 *   - Inline "Edit copy" link on the caption -> opens an inline textarea
 *     to suggest a revised caption; persists via `onCaptionEditSave`. An
 *     edited post is stored as `decision: 'caption_edited'` and reads as
 *     Changes in the decision row.
 *   - Decision row (Approve / Changes) -> the verdict. Two buttons only;
 *     the Changes pill is active for both `changes_requested` and
 *     `caption_edited`.
 *   - Notes textarea -> catch-all for cross-cutting context that does not
 *     fit a pin or a decision.
 *
 * Caption-edit lives inline inside the platform chrome:
 *   - The inline "Edit copy" link on the caption enters edit mode. The
 *     card does NOT snapshot or restore any prior decision.
 *   - Save calls `onCaptionEditSave(draft)` which the shell wires to the
 *     existing draft endpoint, then exits edit mode.
 *   - Cancel just exits edit mode (no decision change).
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
  canEditCaption = true,
  allowPostPins = true,
  canReplaceImage = false,
  onDecisionChange,
  onCommentChange,
  onCaptionEditSave,
  onCreatePin,
  onAppendThreadComment,
  onUploadImage,
  onResolveThread,
  onUseAsPostImage,
  mentionRoster,
  disabled,
  locked,
  hasNewReply,
  className,
}: ReviewPostCardProps) {
  // The verdict, the inline copy editor, and the Notes field lock when the
  // session is submitted (`locked`) OR while a transient save is in flight
  // (`disabled`). Pins + thread replies are intentionally NOT gated on either,
  // so the client can keep discussing changes with the AM after submit.
  const verdictLocked = disabled || locked
  const decision = reviewItem?.decision ?? 'not_reviewed'
  const isUpdated = reviewItem?.updatedSinceLastReview ?? false
  const savedSuggestion = reviewItem?.suggestedCaption ?? null

  // Local controlled comment. Auto-saves debounced while typing (and on blur),
  // surfacing a save-state indicator. Initialized from the reviewItem so
  // re-renders carry server-saved drafts.
  const [comment, setComment] = useState(reviewItem?.comment ?? '')
  const [focused, setFocused] = useState(false)
  const [noteStatus, setNoteStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')

  // The last value we have successfully persisted (seeded from the server
  // value) — a save is skipped when the current value matches it.
  const lastSavedNoteRef = useRef(reviewItem?.comment ?? '')
  // The most recently dispatched save value, so a slow earlier save resolving
  // out of order cannot flip the indicator for text that has since changed.
  const pendingNoteRef = useRef<string | null>(null)
  const noteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearNoteDebounce = useCallback(() => {
    if (noteDebounceRef.current) {
      clearTimeout(noteDebounceRef.current)
      noteDebounceRef.current = null
    }
  }, [])

  const saveNote = useCallback(
    async (value: string) => {
      if (value === lastSavedNoteRef.current) return
      pendingNoteRef.current = value
      setNoteStatus('saving')
      const ok = await onCommentChange(value)
      // Ignore a stale resolve: a newer save was dispatched after this one.
      if (pendingNoteRef.current !== value) return
      if (ok) {
        lastSavedNoteRef.current = value
        setNoteStatus('saved')
      } else {
        setNoteStatus('error')
      }
    },
    [onCommentChange],
  )

  const handleNoteChange = useCallback(
    (value: string) => {
      setComment(value)
      clearNoteDebounce()
      noteDebounceRef.current = setTimeout(() => {
        noteDebounceRef.current = null
        void saveNote(value)
      }, 1000)
    },
    [clearNoteDebounce, saveNote],
  )

  const flushNote = useCallback(() => {
    clearNoteDebounce()
    void saveNote(comment)
  }, [clearNoteDebounce, saveNote, comment])

  // Clear any pending debounce on unmount (no save / setState after unmount).
  useEffect(() => clearNoteDebounce, [clearNoteDebounce])

  // Caption edit state.
  const [isEditing, setIsEditing] = useState(false)
  const [captionDraft, setCaptionDraft] = useState<string>(
    savedSuggestion ?? post.caption,
  )
  useUnsavedChanges(isEditing && captionDraft !== (savedSuggestion ?? post.caption))

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
    setCaptionDraft(savedSuggestion ?? post.caption)
    setIsEditing(true)
  }, [savedSuggestion, post.caption])

  const exitEditMode = useCallback(() => {
    setIsEditing(false)
  }, [])

  const handleDecisionChange = useCallback(
    (next: ReviewDecisionType) => {
      // A verdict click is explicit: discard any in-progress inline edit (the
      // unsaved textarea draft) and forward the verdict. Clearing a SAVED
      // suggested caption on Approve happens in the shell's onDecisionChange
      // handler, not here.
      if (isEditing) {
        exitEditMode()
      }
      onDecisionChange?.(next)
    },
    [isEditing, exitEditMode, onDecisionChange],
  )

  const handleCaptionEditSave = useCallback(async () => {
    if (!onCaptionEditSave) {
      exitEditMode()
      return
    }
    try {
      await onCaptionEditSave(captionDraft)
      exitEditMode()
    } catch {
      // The save failed (the parent callback surfaces its own message). Keep
      // the editor open so the draft is preserved for retry instead of being
      // discarded by exitEditMode.
    }
  }, [captionDraft, onCaptionEditSave, exitEditMode])

  const handleCaptionEditCancel = useCallback(() => {
    exitEditMode()
  }, [exitEditMode])

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

  // Post-level thread (a thread with no anchor coordinates). It has no pin to
  // render in the IG/FB markup overlay, so it would otherwise be invisible.
  // Surface it as an inline Comments discussion below Notes so the client can
  // read AM replies and keep the conversation going.
  const postThread = threads?.find((t) => t.pin.kind === 'post') ?? null

  // captionOverride renders the saved suggestion in place of the original
  // caption while the post is in the `caption_edited` state and not being
  // edited. The reviewer can re-enter via the inline "Edit copy" link, which
  // pre-fills the textarea with the prior suggestion. Suppress the override
  // while editing so the textarea is the only caption surface visible.
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
      {hasNewReply ? (
        <span
          data-testid="new-reply-badge"
          className="inline-flex w-fit items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800"
        >
          <span className="size-1.5 rounded-full bg-sky-500" /> New reply
        </span>
      ) : null}

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
        canReplaceImage={canReplaceImage}
        onCreateThread={onCreatePin}
        onComment={onAppendThreadComment}
        onUploadImage={onUploadImage}
        onResolveThread={onResolveThread}
        onUseAsPostImage={onUseAsPostImage}
        mentionRoster={mentionRoster}
        editing={isEditing}
        captionDraft={isEditing ? captionDraft : undefined}
        onCaptionDraftChange={isEditing ? setCaptionDraft : undefined}
        onCaptionEditSave={isEditing ? handleCaptionEditSave : undefined}
        onCaptionEditCancel={isEditing ? handleCaptionEditCancel : undefined}
        captionOverride={captionOverride}
        onEditCaption={
          // 'review' mode: gate on verdictLocked (existing behaviour).
          // 'internal' mode: gate on canEditCaption prop (AM=true, designer=false).
          mode === 'review'
            ? verdictLocked
              ? undefined
              : enterEditMode
            : canEditCaption
              ? enterEditMode
              : undefined
        }
      />

      {mode === 'review' && (
        <>
          <DecisionButtonRow
            value={decision}
            onChange={handleDecisionChange}
            disabled={verdictLocked}
          />

          {decision === 'changes_requested' || decision === 'caption_edited' ? (
            <p
              data-testid="review-post-card-changes-hint"
              className="text-[12px] text-muted-foreground"
            >
              Pin the parts of the image or caption that need changes, or use Notes
              below for general comments.
            </p>
          ) : null}

          <div>
            <div className="flex items-center justify-between gap-2">
              <label
                className="block text-[12px] font-medium text-muted-foreground"
                htmlFor={`comment-${post.id}`}
              >
                <span data-testid="review-post-card-notes-label">Notes (optional)</span>
              </label>
              <span
                data-testid="review-post-card-notes-status"
                aria-live="polite"
                className="text-[12px]"
              >
                {noteStatus === 'saving' && (
                  <span className="text-muted-foreground">Saving…</span>
                )}
                {noteStatus === 'saved' && (
                  <span className="text-muted-foreground">Saved ✓</span>
                )}
                {noteStatus === 'error' && (
                  <span className="text-destructive">
                    Couldn&apos;t save{' · '}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => void saveNote(comment)}
                    >
                      Retry
                    </button>
                  </span>
                )}
              </span>
            </div>
            <textarea
              id={`comment-${post.id}`}
              data-testid="review-post-card-comment"
              value={comment}
              onChange={(e) => handleNoteChange(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setFocused(false)
                flushNote()
              }}
              placeholder={commentPlaceholder}
              rows={focused || comment.length > 0 ? 3 : 1}
              readOnly={locked}
              disabled={disabled}
              className={cn(
                'mt-1 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-[height,border-color] focus:border-primary disabled:cursor-not-allowed disabled:opacity-60',
              )}
            />
          </div>
        </>
      )}

      {/*
        Post-level Comments. When a post-level thread exists it always renders
        (in-progress and locked) so the client can read + answer an AM reply
        anytime. When there's no thread yet, only show a "start a discussion"
        composer once locked — never as a third box competing with the verdict
        + Notes during an in-progress review.
      */}
      {postThread ? (
        <div data-testid="post-comments-section">
          <p className="mb-1 text-[12px] font-medium text-muted-foreground">
            Comments
          </p>
          <CommentThread
            comments={postThread.comments}
            onSend={(body) => onAppendThreadComment?.(postThread.id, body)}
            readOnly={postThread.status === 'resolved'}
          />
        </div>
      ) : locked && allowPostPins ? (
        <div data-testid="post-comments-section">
          <p className="mb-1 text-[12px] font-medium text-muted-foreground">
            Comments
          </p>
          <CommentThread
            comments={[]}
            onSend={(body) => onCreatePin?.({ kind: 'post' }, body)}
            placeholder="Start a discussion with the team..."
          />
        </div>
      ) : null}
    </article>
  )
}
