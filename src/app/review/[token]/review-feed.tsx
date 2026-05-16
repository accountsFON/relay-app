'use client'

import { useState } from 'react'
import { FeedShell } from '@/components/preview/feed-shell'
import type { Platform } from '@/components/preview/platform-toggle'
import { InstagramFeedPost } from '@/components/preview/instagram-post'
import { FacebookPost } from '@/components/preview/facebook-post'
import type { FeedPostProps } from '@/types/preview'

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
 * apply to both platforms — the chrome is the only thing that changes).
 *
 * onCreateThread + onOpenThread are intentionally omitted in this PR:
 * the comment composer + pin overlay components ship in Task 2.3 and
 * are wired through the FixWithAIButton + thread composer in Task 3.x.
 * For Layer 2 the page renders the feed in read mode; reviewer comment
 * creation is exercised at the server-action layer (leaveCommentAsReviewer)
 * and gets a UI surface in the markup task.
 */
export function ReviewFeed({
  clientName,
  batchLabel,
  reviewerName,
  posts,
}: ReviewFeedProps) {
  const [platform, setPlatform] = useState<Platform>('instagram')

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

      <FeedShell platform={platform} onPlatformChange={setPlatform}>
        {posts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No posts in this batch yet.
          </div>
        ) : (
          posts.map(({ post, threads }) =>
            platform === 'instagram' ? (
              <InstagramFeedPost
                key={post.id}
                post={post}
                client={{ name: clientName, avatarUrl: null }}
                threads={threads}
                mode="review"
              />
            ) : (
              <FacebookPost
                key={post.id}
                post={post}
                client={{ name: clientName, avatarUrl: null }}
                threads={threads}
                mode="review"
              />
            ),
          )
        )}
      </FeedShell>
    </div>
  )
}
