'use client'

import { useState, useRef } from 'react'
import { ReviewFeedbackRail } from '@/components/review/review-feedback-rail'
import { ReviewPostsCanvas } from '@/components/review/review-posts-canvas'
import type { FeedbackPostVM, FeedbackActions } from '@/app/(app)/clients/[id]/batches/[batchId]/review-sessions/[sessionId]/review-feedback-types'

export type ReviewFeedbackShellProps = {
  posts: ReadonlyArray<FeedbackPostVM>
  actions: FeedbackActions
  role: 'am' | 'admin' | 'platformOwner' | 'designer'
  isDesigner: boolean
  canPostComment: boolean
  internalThread: React.ReactNode
  uploadImage?: (file: File) => Promise<{ url: string; width: number; height: number }>
  allAddressed: boolean
  isSuperseded: boolean
  startNextRoundSlot?: React.ReactNode
}

export function ReviewFeedbackShell({
  posts,
  actions,
  isDesigner,
  uploadImage,
  internalThread,
  allAddressed,
  isSuperseded,
  startNextRoundSlot,
}: ReviewFeedbackShellProps) {
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)

  const railRefs = useRef<Record<string, HTMLElement | null>>({})
  const canvasRefs = useRef<Record<string, HTMLElement | null>>({})

  function selectFromCanvasPin(postId: string, threadId: string) {
    setSelectedPostId(postId)
    setSelectedThreadId(threadId)
    railRefs.current[postId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function selectFromRailRow(postId: string) {
    setSelectedPostId(postId)
    setSelectedThreadId(null)
    canvasRefs.current[postId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_minmax(0,1fr)_360px]">
      {/* Column 1: feedback rail */}
      <div className="lg:order-1">
        {allAddressed && !isSuperseded && startNextRoundSlot}
        <ReviewFeedbackRail
          posts={posts}
          actions={actions}
          isDesigner={isDesigner}
          uploadImage={uploadImage}
          selectedPostId={selectedPostId}
          selectedThreadId={selectedThreadId}
          onSelectRow={selectFromRailRow}
          registerRef={(id, el) => {
            railRefs.current[id] = el
          }}
        />
      </div>

      {/* Column 2: posts canvas */}
      <div className="lg:order-2">
        <ReviewPostsCanvas
          posts={posts}
          selectedPostId={selectedPostId}
          selectedThreadId={selectedThreadId}
          onPinClick={selectFromCanvasPin}
          registerRef={(id, el) => {
            canvasRefs.current[id] = el
          }}
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
