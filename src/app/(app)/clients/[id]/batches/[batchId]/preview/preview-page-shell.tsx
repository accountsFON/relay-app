'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FeedShell } from '@/components/preview/feed-shell'
import type { Platform } from '@/components/preview/platform-toggle'
import { InstagramFeedPost } from '@/components/preview/instagram-post'
import { FacebookPost } from '@/components/preview/facebook-post'
import { MediaUpload } from '@/components/posts/media-upload'
import { BulkMediaTray } from '@/components/posts/bulk-media-tray'
import { PostApprovalBadge } from '@/components/preview/post-approval-badge'
import { BulkResolveButton } from '@/components/preview/bulk-resolve-button'
import type { HydratedThread } from '@/server/repositories/threads'
import {
  createThreadAction,
  addCommentAction,
  resolveThreadAction,
} from '@/server/actions/threads'
import type { PinLocation } from '@/types/preview'

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
  canUploadMedia: boolean
  /**
   * 'internal' = AM Clerk-authenticated; 'review' = magic-link client view.
   * Defaults to 'internal' for backwards compatibility with the existing
   * batch preview page. Approval badge renders in both modes; bulk-resolve
   * action is internal-only.
   */
  mode?: 'internal' | 'review'
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
  canUploadMedia,
  mode = 'internal',
}: PreviewPageShellProps) {
  const router = useRouter()
  const [platform, setPlatform] = useState<Platform>('instagram')

  const handleRefresh = () => {
    router.refresh()
  }

  // Approval derivation runs per-render against the props (which the host
  // page hydrates from listThreadsForBatch). Open thread count drives both
  // the badge state and the bulk-resolve trigger.
  const approvalByPostId = useMemo(() => {
    const map = new Map<string, { openCount: number; status: 'ready' | 'pending' }>()
    for (const p of posts) {
      const openCount = p.threads.filter((t) => t.status === 'open').length
      map.set(p.id, {
        openCount,
        status: openCount === 0 ? 'ready' : 'pending',
      })
    }
    return map
  }, [posts])

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
          posts.map((post) => {
            const approval = approvalByPostId.get(post.id) ?? {
              openCount: 0,
              status: 'ready' as const,
            }
            return (
              <div
                key={post.id}
                className="flex flex-col gap-3"
                data-testid="preview-page-post"
                data-post-id={post.id}
              >
                <div
                  className="mx-auto flex w-full max-w-[470px] items-center justify-between gap-2 px-1"
                  data-testid="preview-page-post-header"
                >
                  <PostApprovalBadge
                    status={approval.status}
                    openThreadCount={approval.openCount}
                  />
                  {mode === 'internal' && canEdit && approval.openCount > 0 && (
                    <BulkResolveButton
                      postId={post.id}
                      openThreadCount={approval.openCount}
                      onResolved={handleRefresh}
                    />
                  )}
                </div>

                {canUploadMedia && (
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
                    mode={mode}
                    onCreateThread={async (pin: PinLocation, body: string) => {
                      await createThreadAction({ postId: post.id, pin, body })
                      handleRefresh()
                    }}
                    onComment={async (threadId: string, body: string) => {
                      await addCommentAction({ threadId, body })
                      handleRefresh()
                    }}
                    onResolveThread={
                      mode === 'internal'
                        ? async (threadId: string) => {
                            await resolveThreadAction({
                              threadId,
                              resolvedReason: null,
                            })
                            handleRefresh()
                          }
                        : undefined
                    }
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
                    mode={mode}
                    onCreateThread={async (pin: PinLocation, body: string) => {
                      await createThreadAction({ postId: post.id, pin, body })
                      handleRefresh()
                    }}
                    onComment={async (threadId: string, body: string) => {
                      await addCommentAction({ threadId, body })
                      handleRefresh()
                    }}
                    onResolveThread={
                      mode === 'internal'
                        ? async (threadId: string) => {
                            await resolveThreadAction({
                              threadId,
                              resolvedReason: null,
                            })
                            handleRefresh()
                          }
                        : undefined
                    }
                  />
                )}
              </div>
            )
          })
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
