'use client'

import { cn } from '@/lib/utils'
import { MarkupOverlay, type OverlayPin } from '@/components/preview/markup-overlay'
import type { FeedbackPostVM } from '@/app/(app)/clients/[id]/batches/[batchId]/review-sessions/[sessionId]/review-feedback-types'
import type { PinLocation } from '@/types/preview'

/**
 * Center canvas for the AM client-feedback markup layout. Renders each post
 * (image + caption chips) with read-only clickable markup pins. Clicking a
 * pin/chip calls onPinClick so the left rail can scroll/expand that thread.
 *
 * Purely presentational: no data fetching, no server actions.
 */
export type ReviewPostsCanvasProps = {
  posts: ReadonlyArray<FeedbackPostVM>
  selectedPostId: string | null
  selectedThreadId: string | null
  onPinClick: (postId: string, threadId: string) => void
  registerRef: (postId: string, el: HTMLElement | null) => void
}

export function ReviewPostsCanvas({
  posts,
  selectedPostId,
  selectedThreadId,
  onPinClick,
  registerRef,
}: ReviewPostsCanvasProps) {
  return (
    <div data-testid="review-posts-canvas" className="flex flex-col gap-8">
      {posts.map((post) => {
        const isSelected = selectedPostId === post.postId

        const imagePins: OverlayPin[] = post.threads
          .filter((t) => t.pin.kind === 'image')
          .map((t) => {
            const pin = t.pin as Extract<PinLocation, { kind: 'image' }>
            return { id: t.id, x: pin.x, y: pin.y, status: t.status }
          })

        const nonImageThreads = post.threads.filter((t) => t.pin.kind !== 'image')
        const mediaUrl = post.mediaUrls[0] ?? null

        return (
          <div
            key={post.postId}
            ref={(el) => registerRef(post.postId, el)}
            data-testid={`canvas-post-${post.postId}`}
            data-selected={String(isSelected)}
            className={cn(
              'space-y-3 rounded-xl p-3 transition-shadow',
              isSelected && 'ring-2 ring-amber-400 ring-offset-2',
            )}
          >
            {mediaUrl ? (
              <div
                data-testid={`canvas-post-media-${post.postId}`}
                className="relative w-full max-w-[470px] overflow-hidden rounded-xl bg-[#fafafa]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaUrl} alt="" className="block w-full object-cover" />
                <MarkupOverlay
                  existingPins={imagePins}
                  onPinClick={(threadId) => onPinClick(post.postId, threadId)}
                  onCreatePin={() => {}}
                  disabled
                />
              </div>
            ) : (
              <div
                data-testid={`canvas-post-no-media-${post.postId}`}
                className="flex h-40 w-full max-w-[470px] items-center justify-center rounded-xl bg-[#fafafa] text-[13px] text-[#8e8e8e]"
              >
                No image
              </div>
            )}

            {nonImageThreads.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {nonImageThreads.map((t) => {
                  const isThreadSelected = t.id === selectedThreadId
                  return (
                    <button
                      key={t.id}
                      type="button"
                      data-testid={`canvas-pin-${t.id}`}
                      data-thread-id={t.id}
                      data-selected={String(isThreadSelected)}
                      onClick={() => onPinClick(post.postId, t.id)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-shadow',
                        t.status === 'open'
                          ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                          : 'bg-[#efefef] text-[#8e8e8e] hover:bg-[#e5e5e5]',
                        isThreadSelected && 'ring-2 ring-amber-500 ring-offset-1',
                      )}
                    >
                      <span aria-hidden="true">📍</span>
                      <span>{pinKindLabel(t.pin)}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function pinKindLabel(pin: PinLocation): string {
  switch (pin.kind) {
    case 'image':
      return 'Image pin'
    case 'caption':
      return 'Caption pin'
    case 'post':
      return 'Post note'
  }
}
