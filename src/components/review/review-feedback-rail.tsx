'use client'

import { useTransition } from 'react'
import { cn } from '@/lib/utils'
import { ThreadConversation } from '@/components/review/thread-conversation'
import type { HydratedThread } from '@/server/repositories/threads'
import type {
  FeedbackPostVM,
  FeedbackActions,
} from '@/app/(app)/clients/[id]/batches/[batchId]/review-sessions/[sessionId]/review-feedback-types'

export type ReviewFeedbackRailProps = {
  posts: ReadonlyArray<FeedbackPostVM>
  actions: FeedbackActions
  isDesigner: boolean
  uploadImage?: (file: File) => Promise<{ url: string; width: number; height: number }>
  selectedPostId: string | null
  selectedThreadId: string | null
  onSelectRow: (postId: string) => void
  registerRef: (postId: string, el: HTMLElement | null) => void
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
// Sub-component: per-post row (keeps its own transition state for actions)
// ---------------------------------------------------------------------------

type FeedbackRowProps = {
  post: FeedbackPostVM
  actions: FeedbackActions
  isDesigner: boolean
  uploadImage?: (file: File) => Promise<{ url: string; width: number; height: number }>
  isSelected: boolean
  onSelectRow: (postId: string) => void
  registerRef: (postId: string, el: HTMLElement | null) => void
}

function FeedbackRow({
  post,
  actions,
  isDesigner,
  uploadImage,
  isSelected,
  onSelectRow,
  registerRef,
}: FeedbackRowProps) {
  const [pending, startTransition] = useTransition()

  // "Approved-clean" = approved verdict with no threads at all — collapsed.
  const isApprovedClean = post.verdict === 'approved' && post.threads.length === 0
  const collapsed = isApprovedClean

  const showCaptionActions =
    !isDesigner &&
    post.verdict === 'caption_edited' &&
    post.reviewItemId !== null

  return (
    <div
      ref={(el) => registerRef(post.postId, el)}
      data-collapsed={collapsed ? 'true' : 'false'}
      className={cn(
        'border-b border-border transition-colors',
        isSelected && 'bg-muted/40',
        collapsed && 'opacity-60',
      )}
    >
      {/* Row header — always visible, clickable */}
      <button
        type="button"
        data-testid={`rail-row-${post.postId}`}
        onClick={() => onSelectRow(post.postId)}
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
        <div className="space-y-3 px-3 pb-3">
          {/* Caption suggestion area (AM-only actions) */}
          {showCaptionActions && post.suggestedCaption && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-2.5 text-[13px]">
              <p className="mb-1.5 font-medium text-sky-900">Suggested caption</p>
              <p className="text-sky-800">{post.suggestedCaption}</p>
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
          )}

          {/* Per-thread dialogue */}
          {post.threads.map((thread: HydratedThread) => (
            <div
              key={thread.id}
              data-testid={`rail-thread-${thread.id}`}
              className="rounded-lg border border-border bg-background p-2.5"
            >
              <ThreadConversation
                thread={thread}
                onComment={(threadId, body, image) => actions.comment(threadId, body, image)}
                onResolve={
                  isDesigner
                    ? undefined
                    : (threadId) => actions.resolve(threadId)
                }
                onUseAsPostImage={
                  isDesigner
                    ? undefined
                    : (commentId) => actions.useAsPostImage(post.postId, commentId)
                }
                onUploadImage={uploadImage}
              />
            </div>
          ))}

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

export function ReviewFeedbackRail({
  posts,
  actions,
  isDesigner,
  uploadImage,
  selectedPostId,
  selectedThreadId: _selectedThreadId,
  onSelectRow,
  registerRef,
}: ReviewFeedbackRailProps) {
  return (
    <div
      data-testid="review-feedback-rail"
      className="flex h-full flex-col overflow-y-auto"
    >
      {posts.map((post) => (
        <FeedbackRow
          key={post.postId}
          post={post}
          actions={actions}
          isDesigner={isDesigner}
          uploadImage={uploadImage}
          isSelected={post.postId === selectedPostId}
          onSelectRow={onSelectRow}
          registerRef={registerRef}
        />
      ))}
    </div>
  )
}
