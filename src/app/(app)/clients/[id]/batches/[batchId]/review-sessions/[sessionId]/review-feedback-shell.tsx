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
  internalThread: React.ReactNode
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
  clientName: string
  clientAvatarUrl?: string | null
}

export function ReviewFeedbackShell({
  posts,
  actions,
  isDesigner,
  userDbId,
  internalThread,
  allAddressed,
  isSuperseded,
  startNextRoundSlot,
  clientName,
  clientAvatarUrl,
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
    threadRefs.current[threadId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function toggleThread(threadId: string) {
    setSelectedThreadId((prev) => (prev === threadId ? null : threadId))

    // Also scroll the center canvas to the post that owns this thread.
    const owningPost = posts.find((p) => p.threads.some((t) => t.id === threadId))
    if (owningPost) {
      setSelectedPostId(owningPost.postId)
      canvasRefs.current[owningPost.postId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_minmax(0,1fr)_360px]">
      {/* Column 1: feedback rail (fixed/sticky with its own scroll, so the
          per-pin accordion expands within the panel and the page doesn't jump). */}
      <div className="lg:order-1 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100dvh-5rem)] lg:overflow-y-auto">
        {allAddressed && !isSuperseded && startNextRoundSlot}
        <ReviewFeedbackRail
          posts={posts}
          actions={actions}
          isDesigner={isDesigner}
          uploadImage={uploadImage}
          selectedPostId={selectedPostId}
          selectedThreadId={selectedThreadId}
          onToggleThread={toggleThread}
          registerThreadRef={(id, el) => {
            threadRefs.current[id] = el
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

      {/* Column 3: internal thread (sticky on desktop) */}
      <aside
        aria-label="Internal thread"
        data-testid="review-internal-rail"
        className="lg:sticky lg:top-4 lg:self-start lg:order-3 lg:max-h-[calc(100dvh-5rem)] lg:overflow-y-auto"
      >
        {internalThread}
      </aside>
    </div>
  )
}
