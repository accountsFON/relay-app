'use client'

import { useState, useRef } from 'react'
import { ReviewFeedbackRail } from '@/components/review/review-feedback-rail'
import { ReviewPostsCanvas } from '@/components/review/review-posts-canvas'
import { PlatformToggle, type Platform } from '@/components/preview/platform-toggle'
import { uploadCommentImage } from '@/lib/upload-comment-image'
import type { FeedbackPostVM, FeedbackActions } from '@/app/(app)/clients/[id]/batches/[batchId]/review-sessions/[sessionId]/review-feedback-types'

export type ReviewFeedbackShellProps = {
  posts: ReadonlyArray<FeedbackPostVM>
  actions: FeedbackActions
  role: 'am' | 'admin' | 'platformOwner' | 'designer'
  isDesigner: boolean
  canPostComment: boolean
  /**
   * The AM's database user id. A server component can't pass a
   * `(file: File) => Promise<...>` callback, so the shell (a client
   * component) builds the comment-image upload helper from this id. When
   * absent, image attach in the dialogue is suppressed.
   */
  userDbId?: string
  allAddressed: boolean
  isSuperseded: boolean
  startNextRoundSlot?: React.ReactNode
  /**
   * The designer's respond control ("Mark revisions done") on an internal
   * review read-back. Rendered at the top of the rail. Null on the client
   * read-back and when the viewer/batch is not eligible (gated by the page).
   */
  respondSlot?: React.ReactNode
  clientName: string
  clientAvatarUrl?: string | null
  /** Total designer flags on this batch. */
  flagTotal: number
  /** Designer flags still open (not marked done). */
  flagOpen: number
  /** Batch is in the `implementing_revisions` step. */
  isImplementingRevisions: boolean
  /** Batch sub-state is `awaiting_design_revisions`. */
  subStateAwaitingDesigner: boolean
}

export function ReviewFeedbackShell({
  posts,
  actions,
  isDesigner,
  userDbId,
  allAddressed,
  isSuperseded,
  startNextRoundSlot,
  respondSlot,
  clientName,
  clientAvatarUrl,
  flagTotal,
  flagOpen,
  isImplementingRevisions,
  subStateAwaitingDesigner,
}: ReviewFeedbackShellProps) {
  const uploadImage = userDbId
    ? (file: File) => uploadCommentImage(file, { mode: 'internal', userDbId })
    : undefined

  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [platform, setPlatform] = useState<Platform>('instagram')

  const threadRefs = useRef<Record<string, HTMLElement | null>>({})
  const canvasRefs = useRef<Record<string, HTMLElement | null>>({})

  function selectFromCanvasPin(postId: string, threadId: string) {
    setSelectedPostId(postId)
    setSelectedThreadId(threadId)
    threadRefs.current[threadId]?.scrollIntoView({ block: 'center' })
  }

  // Anchor the center canvas to a post (clicking a post header in the rail).
  // Lets copy-change posts with no pins scroll the canvas like pin rows do.
  function selectPost(postId: string) {
    setSelectedPostId(postId)
    canvasRefs.current[postId]?.scrollIntoView({ block: 'center' })
  }

  function toggleThread(threadId: string) {
    setSelectedThreadId((prev) => (prev === threadId ? null : threadId))

    // Also scroll the center canvas to the post that owns this thread.
    const owningPost = posts.find((p) => p.threads.some((t) => t.id === threadId))
    if (owningPost) {
      setSelectedPostId(owningPost.postId)
      canvasRefs.current[owningPost.postId]?.scrollIntoView({ block: 'center' })
    }
  }

  // P2 #29: a designer's filtered view can be empty (no relevant posts — nothing
  // the client changed and nothing flagged for them). Show a friendly empty state
  // instead of a blank rail + canvas. Placed after all hooks so hook order is
  // preserved. No respond control here: with no flagged posts there is nothing to
  // mark done (the mark-revisions-done button lives inside the rail per post).
  if (posts.length === 0) {
    return (
      <div
        data-testid="feedback-empty"
        className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground"
      >
        No changes to work on.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      {/* Column 1: feedback rail (fixed/sticky with its own scroll, so the
          per-pin accordion expands within the panel and the page doesn't jump). */}
      <div className="lg:order-1 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100dvh-5rem)] lg:overflow-y-auto">
        {respondSlot}
        {allAddressed && !isSuperseded && startNextRoundSlot}
        <ReviewFeedbackRail
          posts={posts}
          actions={actions}
          isDesigner={isDesigner}
          flagTotal={flagTotal}
          flagOpen={flagOpen}
          isImplementingRevisions={isImplementingRevisions}
          subStateAwaitingDesigner={subStateAwaitingDesigner}
          uploadImage={uploadImage}
          selectedPostId={selectedPostId}
          selectedThreadId={selectedThreadId}
          onToggleThread={toggleThread}
          onSelectPost={selectPost}
          registerThreadRef={(id, el) => {
            threadRefs.current[id] = el
          }}
          onScrollToAnchor={(key) => {
            if (threadRefs.current[key]) {
              threadRefs.current[key]?.scrollIntoView({ block: 'center' })
            } else {
              canvasRefs.current[key]?.scrollIntoView({ block: 'center' })
            }
          }}
        />
      </div>

      {/* Column 2: posts canvas */}
      <div className="lg:order-2">
        <div className="mb-4 flex justify-center">
          <PlatformToggle platform={platform} onChange={setPlatform} />
        </div>
        <ReviewPostsCanvas
          posts={posts}
          selectedPostId={selectedPostId}
          selectedThreadId={selectedThreadId}
          onPinClick={selectFromCanvasPin}
          registerRef={(id, el) => {
            canvasRefs.current[id] = el
          }}
          platform={platform}
          clientName={clientName}
          clientAvatarUrl={clientAvatarUrl}
        />
      </div>
    </div>
  )
}
