'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FeedShell } from '@/components/preview/feed-shell'
import type { Platform } from '@/components/preview/platform-toggle'
import { InstagramFeedPost } from '@/components/preview/instagram-post'
import { FacebookPost } from '@/components/preview/facebook-post'
import { MediaUpload } from '@/components/posts/media-upload'
import { BulkMediaTray } from '@/components/posts/bulk-media-tray'
import type { HydratedThread } from '@/server/repositories/threads'

export type PreviewShellPost = {
  id: string
  caption: string
  hashtags: string[]
  mediaUrl: string | null
  postDate: Date
  threads: HydratedThread[]
}

export type PreviewPageShellProps = {
  batchId: string
  client: { id: string; name: string }
  posts: ReadonlyArray<PreviewShellPost>
  canEdit: boolean
}

/**
 * Client composition for the internal batch preview page.
 *
 * Holds platform state (IG vs FB) and renders the matching feed-post
 * component per post. Per-post media upload zone surfaces above each card
 * so AMs can swap an image in line without navigating away. Bulk tray
 * lives at the bottom so a single drop can fan out media across the whole
 * batch.
 *
 * After any media upload the router refresh re-pulls the server data so
 * mediaUrl / threads props stay in sync without a hard reload. Future Task
 * 2.3 plugs in real thread interactions via onCreateThread.
 */
export function PreviewPageShell({
  batchId,
  client,
  posts,
  canEdit,
}: PreviewPageShellProps) {
  const router = useRouter()
  const [platform, setPlatform] = useState<Platform>('instagram')

  const handleRefresh = () => {
    router.refresh()
  }

  // Bulk tray needs the post date + a caption snippet for the per-post slot
  // labels. Pre-shape the props so the tray doesn't have to know about the
  // hydrated thread payload.
  const bulkTrayPosts = posts.map((p) => ({
    id: p.id,
    postDate: p.postDate,
    caption: p.caption,
  }))

  return (
    <div className="flex flex-col gap-6" data-testid="preview-page-shell">
      <FeedShell platform={platform} onPlatformChange={setPlatform}>
        {posts.length === 0 ? (
          <div
            data-testid="preview-page-empty"
            className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground"
          >
            No posts in this relay yet.
          </div>
        ) : (
          posts.map((post) => (
            <div
              key={post.id}
              className="flex flex-col gap-3"
              data-testid="preview-page-post"
              data-post-id={post.id}
            >
              {canEdit && (
                <MediaUpload
                  postId={post.id}
                  currentMediaUrl={post.mediaUrl}
                  onUploaded={handleRefresh}
                />
              )}

              {platform === 'instagram' ? (
                <InstagramFeedPost
                  post={{
                    id: post.id,
                    caption: post.caption,
                    hashtags: post.hashtags,
                    mediaUrl: post.mediaUrl,
                  }}
                  client={{ name: client.name }}
                  threads={post.threads}
                  mode="internal"
                />
              ) : (
                <FacebookPost
                  post={{
                    id: post.id,
                    caption: post.caption,
                    hashtags: post.hashtags,
                    mediaUrl: post.mediaUrl,
                  }}
                  client={{ name: client.name }}
                  threads={post.threads}
                  mode="internal"
                />
              )}
            </div>
          ))
        )}
      </FeedShell>

      {canEdit && posts.length > 0 && (
        <div
          className="mx-auto w-full max-w-[470px] px-4 sm:px-6"
          data-testid="preview-page-bulk-tray"
        >
          <BulkMediaTray
            batchId={batchId}
            posts={bulkTrayPosts}
            onApplied={handleRefresh}
          />
        </div>
      )}
    </div>
  )
}
