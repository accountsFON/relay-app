'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FeedShell } from '@/components/preview/feed-shell'
import type { Platform } from '@/components/preview/platform-toggle'
import { InstagramFeedPost } from '@/components/preview/instagram-post'
import { FacebookPost } from '@/components/preview/facebook-post'
import type { FeedPostProps, PinLocation } from '@/types/preview'
import { addCommentAsReviewer, leaveCommentAsReviewer } from './_actions'

export type ReviewFeedPost = {
  post: FeedPostProps['post']
  threads: FeedPostProps['threads']
}

export type ReviewFeedProps = {
  token: string
  clientName: string
  batchLabel: string
  reviewerName: string
  posts: ReviewFeedPost[]
}

/**
 * Client-side composition of the magic-link review feed.
 *
 * Owns the IG/FB platform toggle state. The page hands us the data
 * statically; rendering toggles do not refetch (the same threads + posts
 * apply to both platforms, the chrome is the only thing that changes).
 *
 * Layer 2.3 wiring: each post receives onCreateThread + onComment bound
 * to the magic-link reviewer actions. onResolveThread is intentionally
 * omitted per design, only AMs can resolve threads.
 */
export function ReviewFeed({
  token,
  clientName,
  batchLabel,
  reviewerName,
  posts,
}: ReviewFeedProps) {
  const router = useRouter()
  // Previews are Facebook-only; Instagram chrome is left dormant. Add setPlatform
  // back + the FeedShell PlatformToggle to re-enable Instagram/Facebook switching.
  const [platform] = useState<Platform>('facebook')

  function buildPostCallbacks(postId: string) {
    return {
      onCreateThread: async (pin: PinLocation, body: string) => {
        await leaveCommentAsReviewer({ token, postId, pin, body })
        router.refresh()
      },
      onComment: async (threadId: string, body: string) => {
        await addCommentAsReviewer({ token, threadId, body })
        router.refresh()
      },
    }
  }

  return (
    <div className="flex flex-col">
      <div className="border-b border-border bg-card/40">
        <div className="mx-auto flex w-full max-w-[640px] flex-col px-4 py-4 sm:px-6">
          <h1 className="text-base font-semibold text-foreground">{batchLabel}</h1>
          <p className="text-xs text-muted-foreground">
            Reviewing as <span className="font-medium text-foreground">{reviewerName}</span>
          </p>
        </div>
      </div>

      <FeedShell>
        {posts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No posts in this relay yet.
          </div>
        ) : (
          posts.map(({ post, threads }) => {
            const cb = buildPostCallbacks(post.id)
            return platform === 'instagram' ? (
              <InstagramFeedPost
                key={post.id}
                post={post}
                client={{ name: clientName, avatarUrl: null }}
                threads={threads}
                mode="review"
                onCreateThread={cb.onCreateThread}
                onComment={cb.onComment}
              />
            ) : (
              <FacebookPost
                key={post.id}
                post={post}
                client={{ name: clientName, avatarUrl: null }}
                threads={threads}
                mode="review"
                onCreateThread={cb.onCreateThread}
                onComment={cb.onComment}
              />
            )
          })
        )}
      </FeedShell>
    </div>
  )
}
