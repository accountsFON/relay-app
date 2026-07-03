'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { PinCommentRow } from '@/components/review/pin-comment-row'
import { CaptionDiffView } from '@/components/preview/caption-diff-view'
import { ChangesNavigator, type NavItem } from '@/components/review/changes-navigator'
import { ResolveCheckbox } from '@/components/review/resolve-checkbox'
import { DesignerFlagToggle } from '@/components/review/designer-flag-toggle'
import { diffText } from '@/lib/text-diff'
import type { HydratedThread } from '@/server/repositories/threads'
import type {
  FeedbackPostVM,
  FeedbackActions,
} from '@/app/(app)/clients/[id]/batches/[batchId]/review-sessions/[sessionId]/review-feedback-types'

export type ReviewFeedbackRailProps = {
  posts: ReadonlyArray<FeedbackPostVM>
  actions: FeedbackActions
  isDesigner: boolean
  /** Total designer flags on this batch (rendered by a later task). */
  flagTotal: number
  /** Designer flags still open (rendered by a later task). */
  flagOpen: number
  /** Batch is in the `implementing_revisions` step (rendered by a later task). */
  isImplementingRevisions: boolean
  /** Batch sub-state is `awaiting_design_revisions` (rendered by a later task). */
  subStateAwaitingDesigner: boolean
  uploadImage?: (file: File) => Promise<{ url: string; width: number; height: number }>
  selectedThreadId: string | null
  selectedPostId: string | null
  onToggleThread: (threadId: string) => void
  /** Anchor the center canvas to a post (clicking the post header). Used so
   *  copy-change posts (and any post) scroll the canvas the way pins do. */
  onSelectPost: (postId: string) => void
  registerThreadRef: (threadId: string, el: HTMLElement | null) => void
  /** Scroll the canvas/rail to the given anchor key (threadId or postId). */
  onScrollToAnchor: (anchorKey: string) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function verdictLabel(verdict: FeedbackPostVM['verdict']): string {
  switch (verdict) {
    case 'approved':
      return 'Approved'
    case 'changes_requested':
      return 'Changes'
    case 'caption_edited':
      return 'Caption edit'
    case 'none':
      return 'Pins'
  }
}

function verdictBadgeClass(verdict: FeedbackPostVM['verdict']): string {
  switch (verdict) {
    case 'approved':
      return 'bg-emerald-100 text-emerald-800'
    case 'changes_requested':
      return 'bg-amber-100 text-amber-800'
    case 'caption_edited':
      return 'bg-sky-100 text-sky-800'
    case 'none':
      return 'bg-[#efefef] text-[#555]'
  }
}

function rowSummary(post: FeedbackPostVM): string {
  const openCount = post.threads.filter((t) => t.status === 'open').length
  if (openCount > 0) return `${openCount} pin${openCount !== 1 ? 's' : ''}`
  if (post.threads.length > 0) return `${post.threads.length} resolved`
  return post.verdict === 'caption_edited' ? 'Caption suggestion' : ''
}

// ---------------------------------------------------------------------------
// Sub-component: per-post row
// ---------------------------------------------------------------------------

type FeedbackRowProps = {
  post: FeedbackPostVM
  actions: FeedbackActions
  isDesigner: boolean
  uploadImage?: (file: File) => Promise<{ url: string; width: number; height: number }>
  isSelected: boolean
  selectedThreadId: string | null
  onToggleThread: (threadId: string) => void
  onSelectPost: (postId: string) => void
  registerThreadRef: (threadId: string, el: HTMLElement | null) => void
}

function FeedbackRow({
  post,
  actions,
  isDesigner,
  uploadImage,
  isSelected,
  selectedThreadId,
  onToggleThread,
  onSelectPost,
  registerThreadRef,
}: FeedbackRowProps) {
  const [pending, startTransition] = useTransition()
  const [generalDraft, setGeneralDraft] = useState('')

  // ---------------------------------------------------------------------------
  // Auto-address roll-up
  // Resolves the given item (pin thread or note) and, if it is the last unresolved
  // item on this post (using the pre-revalidation snapshot), fires markAddressed.
  // The check treats the just-resolved item as done so we don't need a re-render.
  // ---------------------------------------------------------------------------
  async function resolveThenMaybeAddress(
    kind: 'note' | 'pin',
    threadId?: string,
  ): Promise<void> {
    if (kind === 'note') {
      await actions.resolveNote(post.postId, post.reviewItemId!)
    } else {
      await actions.resolve(threadId!)
    }

    // Would the post now be fully resolved? Treat the just-resolved item as done.
    const pinsDone = post.threads.every(
      (t) => t.status === 'resolved' || (kind === 'pin' && t.id === threadId),
    )
    const noteDone = !post.comment || post.noteResolved || kind === 'note'
    const capDone =
      post.verdict !== 'caption_edited' || post.captionAccepted

    if (pinsDone && noteDone && capDone && !post.addressed) {
      await actions.markAddressed(post.postId, post.reviewItemId)
    }
  }

  // Coordinate pins (image/caption) carry numbered badges and stay aligned with
  // the center canvas, which numbers only those. Post-level threads have no
  // coordinates, so they render in their own "General feedback" subsection.
  const pinThreads = post.threads.filter((t) => t.pin.kind !== 'post')
  const postThreads = post.threads.filter((t) => t.pin.kind === 'post')

  // "Approved-clean" = approved verdict with no threads at all — collapsed.
  const isApprovedClean = post.verdict === 'approved' && post.threads.length === 0
  const collapsed = isApprovedClean

  const showCaptionActions =
    !isDesigner &&
    post.verdict === 'caption_edited' &&
    post.reviewItemId !== null

  return (
    <div
      data-collapsed={collapsed ? 'true' : 'false'}
      className={cn(
        'border-b border-border transition-colors',
        isSelected && 'bg-muted/40',
        collapsed && 'opacity-60',
      )}
    >
      {/* Post header — clicking it anchors the center canvas to this post
          (so copy-change posts with no pins still scroll the canvas, like
          pin rows do). */}
      <button
        type="button"
        data-testid={`rail-row-${post.postId}`}
        onClick={() => onSelectPost(post.postId)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/30"
      >
        <span className="min-w-[1.5rem] text-[12px] font-semibold text-muted-foreground">
          #{post.postNumber}
        </span>
        <span
          className={cn(
            'inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium',
            verdictBadgeClass(post.verdict),
          )}
        >
          {verdictLabel(post.verdict)}
        </span>
        <span className="truncate text-[12px] text-muted-foreground">
          {rowSummary(post)}
        </span>
      </button>

      {/* Expanded body — omitted for approved-clean rows */}
      {!collapsed && (
        <div className="space-y-2 px-3 pb-3">
          {/* Caption suggestion area (AM-only actions) */}
          {showCaptionActions && post.suggestedCaption && (
            post.captionAccepted ? (
              // Accepted: greyed, done success state. Still clickable to anchor
              // the canvas. No Accept/Reject (the edit is applied to the post).
              <div
                data-testid={`rail-caption-accepted-${post.postId}`}
                role="button"
                tabIndex={0}
                onClick={() => onSelectPost(post.postId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelectPost(post.postId)
                  }
                }}
                className="cursor-pointer rounded-lg border border-border bg-muted/40 p-2.5 text-[13px] opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
              >
                <p className="mb-1 flex items-center gap-1 font-medium text-emerald-700">
                  <span aria-hidden>✓</span> Caption accepted
                </p>
                <p className="whitespace-pre-wrap break-words text-muted-foreground">
                  {post.caption}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-2.5 text-[13px]">
                {/* Clicking the label/diff anchors the canvas to this post (the
                    Accept/Reject buttons sit outside this region, so they never
                    trigger an anchor). A role=button div is used because the diff
                    renders a block element that can't be nested in a <button>. */}
                <div
                  data-testid={`rail-copy-edited-anchor-${post.postId}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectPost(post.postId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelectPost(post.postId)
                    }
                  }}
                  className="cursor-pointer rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
                >
                  <p
                    data-testid={`rail-copy-edited-label-${post.postId}`}
                    className="mb-1.5 font-medium text-sky-900"
                  >
                    Copy edited
                  </p>
                  <CaptionDiffView
                    segments={diffText(post.caption, post.suggestedCaption)}
                    className="text-[13px]"
                  />
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    data-testid={`rail-accept-${post.postId}`}
                    disabled={pending}
                    onClick={() =>
                      startTransition(() => {
                        void actions.acceptCaption(post.reviewItemId!)
                      })
                    }
                    className="rounded-md bg-emerald-600 px-3 py-1 text-[12px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    data-testid={`rail-reject-${post.postId}`}
                    disabled={pending}
                    onClick={() =>
                      startTransition(() => {
                        void actions.rejectCaption(post.reviewItemId!)
                      })
                    }
                    className="rounded-md border border-border px-3 py-1 text-[12px] font-semibold text-foreground hover:bg-muted disabled:opacity-60"
                  >
                    Reject
                  </button>
                </div>
              </div>
            )
          )}

          {/* Per-pin collapsible rows. Numbered over coordinate pins only, so
              the rail badges stay aligned with the center canvas pin numbers
              (the canvas can't render a coordinate-less post-level thread). */}
          {pinThreads.map((thread: HydratedThread, i: number) => (
            <div
              key={thread.id}
              data-testid={`rail-thread-${thread.id}`}
              ref={(el) => registerThreadRef(thread.id, el)}
            >
              <PinCommentRow
                thread={thread}
                pinLabel={String(i + 1)}
                expanded={selectedThreadId === thread.id}
                onToggle={() => onToggleThread(thread.id)}
                onComment={(tid, body, image) => actions.comment(tid, body, image)}
                onResolve={
                  isDesigner ? undefined : (tid) => resolveThenMaybeAddress('pin', tid)
                }
                onUseAsPostImage={
                  isDesigner ? undefined : (cid) => actions.useAsPostImage(post.postId, cid)
                }
                onUploadImage={uploadImage}
              />
              {/* AM-only: route this client pin to the designer. */}
              {!isDesigner && (
                <div className="mt-1">
                  <DesignerFlagToggle
                    flag={post.flags.find((f) => f.threadId === thread.id) ?? null}
                    onFlag={(note) =>
                      actions.flagForDesigner(post.postId, { threadId: thread.id }, note)
                    }
                    onUnflag={actions.unflagForDesigner}
                    testId={`rail-flag-thread-${thread.id}`}
                  />
                </div>
              )}
            </div>
          ))}

          {/* General feedback (post-level, non-pin). Once an AM replies to the
              client's Notes, the server promotes it to a reviewer post-level
              thread that renders here as a full back-and-forth. */}
          {postThreads.map((thread: HydratedThread) => (
            <div
              key={thread.id}
              data-testid={`rail-postthread-${thread.id}`}
              ref={(el) => registerThreadRef(thread.id, el)}
            >
              <PinCommentRow
                thread={thread}
                pinLabel="·"
                expanded={selectedThreadId === thread.id}
                onToggle={() => onToggleThread(thread.id)}
                onComment={(tid, body, image) => actions.comment(tid, body, image)}
                onResolve={
                  isDesigner ? undefined : (tid) => resolveThenMaybeAddress('pin', tid)
                }
                onUseAsPostImage={
                  isDesigner ? undefined : (cid) => actions.useAsPostImage(post.postId, cid)
                }
                onUploadImage={uploadImage}
              />
            </div>
          ))}

          {/* Notes opener + resolve checkbox + reply composer (AM only). Shown
              only when the client left general Notes and no post-level thread
              exists yet. Sending promotes the Notes into a post-level thread
              (server side), after which the postThreads row above replaces this
              block. The checkbox lets the AM tick the note as resolved without
              needing to reply first. */}
          {!isDesigner &&
            post.comment &&
            post.comment.trim().length > 0 &&
            postThreads.length === 0 &&
            post.reviewItemId && (
              <div
                data-testid={`rail-general-feedback-${post.postId}`}
                className="rounded-lg border border-border bg-muted/30 p-2.5 text-[13px]"
              >
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  General feedback
                </p>
                <div className="mb-2">
                  <ResolveCheckbox
                    label={post.comment}
                    resolved={post.noteResolved}
                    onResolve={() => resolveThenMaybeAddress('note')}
                    onUnresolve={() => actions.unresolveNote(post.postId, post.reviewItemId!)}
                    disabled={isDesigner}
                    testId={`rail-note-resolve-${post.postId}`}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <textarea
                    data-testid={`rail-general-feedback-input-${post.postId}`}
                    value={generalDraft}
                    onChange={(e) => setGeneralDraft(e.target.value)}
                    rows={2}
                    placeholder="Reply…"
                    className="min-h-[44px] flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    data-testid={`rail-general-feedback-send-${post.postId}`}
                    disabled={pending}
                    onClick={() => {
                      const body = generalDraft.trim()
                      if (!body) return
                      startTransition(() => {
                        void actions.replyToFeedback(post.reviewItemId!, body)
                      })
                      setGeneralDraft('')
                    }}
                    className="min-h-[44px] rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                  >
                    Send
                  </button>
                </div>
              </div>
            )}

          {/* AM-only: route this post's note/verdict to the designer. Only when
              the post carries a review item worth flagging (verdict !== 'none'). */}
          {!isDesigner && post.reviewItemId && post.verdict !== 'none' && (
            <DesignerFlagToggle
              flag={post.flags.find((f) => f.reviewItemId === post.reviewItemId) ?? null}
              onFlag={(note) =>
                actions.flagForDesigner(post.postId, { reviewItemId: post.reviewItemId! }, note)
              }
              onUnflag={actions.unflagForDesigner}
              testId={`rail-flag-note-${post.postId}`}
            />
          )}

          {/* Mark addressed / Move back (AM only) */}
          {!isDesigner && (
            <button
              type="button"
              data-testid={`rail-mark-addressed-${post.postId}`}
              disabled={pending}
              onClick={() =>
                startTransition(() => {
                  if (post.addressed) {
                    void actions.unmarkAddressed(post.postId, post.reviewItemId)
                  } else {
                    void actions.markAddressed(post.postId, post.reviewItemId)
                  }
                })
              }
              className="text-[12px] text-muted-foreground underline-offset-2 hover:underline disabled:opacity-60"
            >
              {post.addressed ? 'Move back' : 'Mark addressed'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function needsChanges(p: FeedbackPostVM): boolean {
  return (
    !p.addressed &&
    (p.verdict === 'changes_requested' ||
      p.verdict === 'caption_edited' ||
      p.threads.some((t) => t.status === 'open') ||
      (Boolean(p.comment) && !p.noteResolved))
  )
}

export function ReviewFeedbackRail({
  posts,
  actions,
  isDesigner,
  flagTotal,
  flagOpen,
  isImplementingRevisions,
  subStateAwaitingDesigner,
  uploadImage,
  selectedPostId,
  selectedThreadId,
  onToggleThread,
  onSelectPost,
  registerThreadRef,
  onScrollToAnchor,
}: ReviewFeedbackRailProps) {
  const [filterOn, setFilterOn] = useState(false)
  const [sending, setSending] = useState(false)

  // "Send to designer" is available only once the batch is implementing
  // revisions, at least one item is flagged, and we haven't already sent.
  const canSend =
    isImplementingRevisions && flagTotal >= 1 && !subStateAwaitingDesigner && !sending

  function handleSendToDesigner() {
    if (!canSend) return
    setSending(true)
    void actions.sendToDesigner().catch(() => setSending(false))
  }

  const sendHint = subStateAwaitingDesigner
    ? 'Sent, waiting on designer'
    : !isImplementingRevisions
      ? 'Available once revisions start'
      : flagTotal < 1
        ? 'Flag at least one item first'
        : undefined

  const visiblePosts = filterOn ? posts.filter(needsChanges) : posts

  const navItems: NavItem[] = visiblePosts.flatMap((p) => {
    const out: NavItem[] = []
    p.threads.forEach((t) =>
      out.push({ id: t.id, anchorKey: t.id, resolved: t.status === 'resolved' }),
    )
    if (p.comment && p.reviewItemId) {
      out.push({
        id: `note-${p.reviewItemId}`,
        anchorKey: p.postId,
        resolved: p.noteResolved,
      })
    }
    if (p.verdict === 'caption_edited' && p.suggestedCaption && p.reviewItemId) {
      out.push({
        id: `cap-${p.reviewItemId}`,
        anchorKey: p.postId,
        resolved: p.captionAccepted || p.addressed,
      })
    }
    return out
  })

  return (
    <div
      data-testid="review-feedback-rail"
      className="flex flex-col"
    >
      <div className="px-3 py-2">
        <ChangesNavigator
          items={navItems}
          filterOn={filterOn}
          onToggleFilter={() => setFilterOn((v) => !v)}
          onNavigate={onScrollToAnchor}
        />
      </div>

      {/* AM triage bar: how many items are flagged + send them to the designer.
          Hidden entirely in the designer branch. */}
      {!isDesigner && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <span
            data-testid="rail-flag-count"
            className="text-[12px] text-muted-foreground"
          >
            {flagTotal === 0
              ? 'No items flagged for designer'
              : `${flagTotal} flagged for designer${
                  flagOpen !== flagTotal ? ` · ${flagOpen} open` : ''
                }`}
          </span>
          <button
            type="button"
            data-testid="rail-send-to-designer"
            onClick={handleSendToDesigner}
            disabled={!canSend}
            title={sendHint}
            className="rounded-md bg-primary px-3 py-1 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {subStateAwaitingDesigner ? 'Sent, waiting on designer' : 'Send to designer'}
          </button>
        </div>
      )}

      {visiblePosts.map((post) => (
        <FeedbackRow
          key={post.postId}
          post={post}
          actions={actions}
          isDesigner={isDesigner}
          uploadImage={uploadImage}
          isSelected={post.postId === selectedPostId}
          selectedThreadId={selectedThreadId}
          onToggleThread={onToggleThread}
          onSelectPost={onSelectPost}
          registerThreadRef={registerThreadRef}
        />
      ))}
    </div>
  )
}
