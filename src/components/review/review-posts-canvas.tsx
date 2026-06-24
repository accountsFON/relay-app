'use client'

import { cn } from '@/lib/utils'
import { InstagramFeedPost } from '@/components/preview/instagram-post'
import { FacebookPost } from '@/components/preview/facebook-post'
import type { Platform } from '@/components/preview/platform-toggle'
import type { FeedbackPostVM } from '@/app/(app)/clients/[id]/batches/[batchId]/review-sessions/[sessionId]/review-feedback-types'

/**
 * Center canvas for the AM client-feedback markup layout. Renders each post
 * as a faithful IG/FB post (image + caption + pins) via the platform post
 * components in read-only mode. Clicking a pin calls onPinClick so the left
 * rail can scroll/expand that thread.
 *
 * Purely presentational: no data fetching, no server actions.
 */
export type ReviewPostsCanvasProps = {
  posts: ReadonlyArray<FeedbackPostVM>
  selectedPostId: string | null
  selectedThreadId: string | null
  onPinClick: (postId: string, threadId: string) => void
  registerRef: (postId: string, el: HTMLElement | null) => void
  platform: Platform
  clientName: string
  clientAvatarUrl?: string | null
}

export function ReviewPostsCanvas({
  posts,
  selectedPostId,
  // selectedThreadId is accepted in props (used by shell state) but not needed
  // inside the canvas itself — the post components manage their own pin state.
  selectedThreadId: _unused,
  onPinClick,
  registerRef,
  platform,
  clientName,
  clientAvatarUrl,
}: ReviewPostsCanvasProps) {
  void _unused
  const PostComponent = platform === 'facebook' ? FacebookPost : InstagramFeedPost

  return (
    <div data-testid="review-posts-canvas" className="flex flex-col gap-8">
      {posts.map((post) => {
        const isSelected = selectedPostId === post.postId

        return (
          <div
            key={post.postId}
            ref={(el) => registerRef(post.postId, el)}
            data-testid={`canvas-post-${post.postId}`}
            data-selected={String(isSelected)}
            className={cn(
              'space-y-2 rounded-xl p-3 transition-shadow',
              isSelected && 'ring-2 ring-amber-400 ring-offset-2',
            )}
          >
            {post.verdict === 'caption_edited' && (
              <div
                data-testid={`canvas-copy-edited-badge-${post.postId}`}
                className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-medium text-blue-800"
              >
                Copy edited
              </div>
            )}

            <PostComponent
              post={{
                id: post.postId,
                caption: post.caption,
                hashtags: [],
                mediaUrl: post.mediaUrls[0] ?? null,
              }}
              client={{
                name: clientName,
                avatarUrl: clientAvatarUrl ?? undefined,
              }}
              threads={post.threads}
              mode="internal"
              suppressInlinePopover
              onOpenThread={(threadId) => onPinClick(post.postId, threadId)}
            />
          </div>
        )
      })}
    </div>
  )
}
