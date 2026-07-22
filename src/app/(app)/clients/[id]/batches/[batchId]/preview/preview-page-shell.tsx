'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FeedShell } from '@/components/preview/feed-shell'
import type { Platform } from '@/components/preview/platform-toggle'
import { InstagramFeedPost } from '@/components/preview/instagram-post'
import { FacebookPost } from '@/components/preview/facebook-post'
import { PostApprovalBadge } from '@/components/preview/post-approval-badge'
import { BulkResolveButton } from '@/components/preview/bulk-resolve-button'
import type { HydratedThread } from '@/server/repositories/threads'
import {
  createThreadAction,
  addCommentAction,
  resolveThreadAction,
  useCommentImageAsPostMediaAction,
} from '@/server/actions/threads'
import type { PinLocation } from '@/types/preview'
import type { MentionTarget } from '@/lib/mentions'
import { uploadCommentImage } from '@/lib/upload-comment-image'

export type PreviewShellPost = {
  id: string
  caption: string
  hashtags: string[]
  mediaUrl: string | null
  postDate: Date
  threads: HydratedThread[]
}

export type PreviewPageShellProps = {
  client: { id: string; name: string }
  posts: ReadonlyArray<PreviewShellPost>
  canEdit: boolean
  /**
   * 'internal' = AM Clerk-authenticated; 'review' = magic-link client view.
   * Defaults to 'internal' for backwards compatibility with the existing
   * batch preview page. Approval badge renders in both modes; bulk-resolve
   * action is internal-only.
   */
  mode?: 'internal' | 'review'
  /**
   * The AM's database user id. When provided, enables image-attach in the
   * pin composers (uploads go to comment-images/am/<userDbId>/). When omitted
   * the attach button is suppressed (graceful degradation).
   */
  userDbId?: string
  /**
   * Internal @-mention roster (AM + designer + admins) for this client. Passed
   * into the pin composers so typing `@` shows an autocomplete dropdown.
   * Defaulted to [] so the client `/review/[token]` shell (which passes no
   * roster) shows no autocomplete and is unchanged.
   */
  mentionRoster?: MentionTarget[]
}

/**
 * Client composition for the internal batch preview page.
 *
 * Holds platform state (IG vs FB) and renders the matching feed-post
 * component per post. This surface is view + review only: all image upload
 * (bulk and per-post) now lives on the main batch run view, so the AM sees
 * the posts exactly as the client will.
 *
 * After a review action the router refresh re-pulls the server data so
 * threads props stay in sync without a hard reload.
 */
export function PreviewPageShell({
  client,
  posts,
  canEdit,
  mode = 'internal',
  userDbId,
  mentionRoster = [],
}: PreviewPageShellProps) {
  const router = useRouter()
  // Previews are Facebook-only; Instagram chrome is left dormant. Add setPlatform
  // back + the FeedShell PlatformToggle to re-enable Instagram/Facebook switching.
  const [platform] = useState<Platform>('facebook')

  const handleRefresh = () => {
    router.refresh()
  }

  // Build the upload helper once; undefined when no userDbId (graceful
  // degradation: attach button simply won't render).
  const handleUploadImage = userDbId
    ? (file: File) =>
        uploadCommentImage(file, { mode: 'internal', userDbId })
    : undefined

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

  return (
    <div className="flex flex-col gap-6" data-testid="preview-page-shell">
      <FeedShell>
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
                    mentionRoster={mentionRoster}
                    onUploadImage={handleUploadImage}
                    onUseAsPostImage={
                      mode === 'internal'
                        ? async (commentId: string) => {
                            await useCommentImageAsPostMediaAction({ postId: post.id, commentId })
                            handleRefresh()
                          }
                        : undefined
                    }
                    onCreateThread={async (
                      pin: PinLocation,
                      body: string,
                      image?: { url: string; width?: number; height?: number },
                    ) => {
                      await createThreadAction({ postId: post.id, pin, body, image })
                      handleRefresh()
                    }}
                    onComment={async (
                      threadId: string,
                      body: string,
                      image?: { url: string; width?: number; height?: number },
                    ) => {
                      await addCommentAction({ threadId, body, image })
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
                    mentionRoster={mentionRoster}
                    onUploadImage={handleUploadImage}
                    onUseAsPostImage={
                      mode === 'internal'
                        ? async (commentId: string) => {
                            await useCommentImageAsPostMediaAction({ postId: post.id, commentId })
                            handleRefresh()
                          }
                        : undefined
                    }
                    onCreateThread={async (
                      pin: PinLocation,
                      body: string,
                      image?: { url: string; width?: number; height?: number },
                    ) => {
                      await createThreadAction({ postId: post.id, pin, body, image })
                      handleRefresh()
                    }}
                    onComment={async (
                      threadId: string,
                      body: string,
                      image?: { url: string; width?: number; height?: number },
                    ) => {
                      await addCommentAction({ threadId, body, image })
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
    </div>
  )
}
