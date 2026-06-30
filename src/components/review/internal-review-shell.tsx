'use client'

import { useCallback, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FeedShell } from '@/components/preview/feed-shell'
import type { Platform } from '@/components/preview/platform-toggle'
import type { FeedPostProps, PinLocation } from '@/types/preview'
import { ReviewPostCard } from '@/components/review/review-post-card'
import { InternalReviewRail, type InternalRailRow } from '@/components/review/internal-review-rail'
import {
  createThreadAction,
  addCommentAction,
  resolveThreadAction,
  // Aliased: the source export starts with `use`, which trips the
  // react-hooks/rules-of-hooks linter when called inside a useCallback. It is
  // a server action, not a hook.
  useCommentImageAsPostMediaAction as applyCommentImageAsPostMediaAction,
} from '@/server/actions/threads'
import { toast } from 'sonner'
import { updatePostAction } from '@/server/actions/posts'
import { uploadCommentImage } from '@/lib/upload-comment-image'
import type { MentionTarget } from '@/lib/mentions'

export type InternalReviewShellPost = {
  post: FeedPostProps['post']
  /**
   * Hydrated threads on the post (image pins, caption pins, post-level
   * threads). Rendered as numbered badges over the image + caption highlight
   * ranges, exactly as on the client surface. Defaults to an empty array.
   */
  threads?: FeedPostProps['threads']
}

export type InternalReviewShellProps = {
  /** The batch under internal review. Anchors every Phase 1 server action. */
  batchId: string
  clientName: string
  clientAvatarUrl?: string | null
  /** The AM's display name (shown in the "Reviewing as" line). */
  reviewerName: string
  /**
   * The AM's database user id. Enables image-attach in the pin composers
   * (uploads go to comment-images/am/<userDbId>/), exactly as the legacy
   * /preview shell did. When omitted, the attach button is suppressed.
   */
  reviewerUserId?: string
  /**
   * Internal @-mention roster (AM + designer + admins) for this client. Passed
   * into the pin composers' @-autocomplete. The page already fetches this.
   */
  mentionRoster?: MentionTarget[]
  posts: ReadonlyArray<InternalReviewShellPost>
  /** When true (default), the AM can inline-edit post captions. */
  canEditCaption?: boolean
  /**
   * When false, the post-level pin composer is hidden on each card.
   * Image-pin markup overlay and reply popovers are unaffected.
   * Defaults to true. Pass false for the designer tier.
   */
  allowPostPins?: boolean
  /** Slot rendered in the top bar for AM-specific controls (e.g. request changes). */
  amControlsSlot?: React.ReactNode
  /** Slot rendered in the top bar for designer-specific controls. */
  designerControlsSlot?: React.ReactNode
}

/**
 * Markup-only internal review surface on `/preview`. Displays the post feed
 * with pins and threads for AM review. No verdict/submit/session machinery.
 * Pins and replies route through the Clerk-authed thread actions (same as
 * today's /preview). Caption edits route through updatePostAction.
 */
export function InternalReviewShell({
  // batchId kept in props interface for callers; not consumed by this component
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  batchId: _batchId,
  clientName,
  clientAvatarUrl,
  reviewerName,
  reviewerUserId,
  mentionRoster = [],
  posts,
  canEditCaption = true,
  allowPostPins = true,
  amControlsSlot,
  designerControlsSlot,
}: InternalReviewShellProps) {
  const router = useRouter()
  const [platform, setPlatform] = useState<Platform>('instagram')
  const [, startTransition] = useTransition()

  // --- Markup-layout scroll sync ---
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const canvasRefs = useRef<Record<string, HTMLElement | null>>({})

  const selectPost = useCallback((postId: string) => {
    setSelectedPostId(postId)
    canvasRefs.current[postId]?.scrollIntoView({ block: 'center' })
  }, [])

  const railRows: InternalRailRow[] = useMemo(
    () =>
      posts.map(({ post, threads }, idx) => {
        const list = threads ?? []
        const openCount = list.filter((t) => t.status === 'open').length
        const pinStatus: InternalRailRow['pinStatus'] =
          openCount > 0 ? 'open' : list.length > 0 ? 'resolved' : 'none'
        return {
          postId: post.id,
          postNumber: idx + 1,
          thumbnailUrl: post.mediaUrl ?? null,
          pinStatus,
          openCount,
        }
      }),
    [posts],
  )

  /**
   * Drop an AM pin on a post via the Clerk-authed `createThreadAction`
   * (the same action today's /preview uses), then refresh so the new thread
   * hydrates onto the card.
   */
  const handleCreatePin = useCallback(
    async (
      postId: string,
      pin: PinLocation,
      body: string,
      image?: { url: string; width?: number; height?: number },
    ) => {
      try {
        await createThreadAction({ postId, pin, body, image })
        startTransition(() => router.refresh())
      } catch (err) {
        console.error('[internal-review-shell] createThreadAction failed', err)
      }
    },
    [router, startTransition],
  )

  const handleAppendThreadComment = useCallback(
    async (
      threadId: string,
      body: string,
      image?: { url: string; width?: number; height?: number },
    ) => {
      try {
        await addCommentAction({ threadId, body, image })
        startTransition(() => router.refresh())
      } catch (err) {
        console.error('[internal-review-shell] addCommentAction failed', err)
      }
    },
    [router, startTransition],
  )

  /**
   * Resolve an AM pin/thread from the feed popover, via the Clerk-authed
   * `resolveThreadAction`, then refresh so the resolved state hydrates back.
   */
  const handleResolveThread = useCallback(
    async (threadId: string) => {
      try {
        await resolveThreadAction({ threadId, resolvedReason: null })
        startTransition(() => router.refresh())
      } catch (err) {
        console.error('[internal-review-shell] resolveThreadAction failed', err)
      }
    },
    [router, startTransition],
  )

  /**
   * Promote a comment's attached image to the post media.
   */
  const handleUseAsPostImage = useCallback(
    async (postId: string, commentId: string) => {
      try {
        await applyCommentImageAsPostMediaAction({ postId, commentId })
        startTransition(() => router.refresh())
      } catch (err) {
        console.error(
          '[internal-review-shell] useCommentImageAsPostMediaAction failed',
          err,
        )
      }
    },
    [router, startTransition],
  )

  // Image-attach in the pin composers. Undefined when no reviewerUserId
  // (graceful degradation: the attach button won't render).
  const handleUploadImage = useMemo(
    () =>
      reviewerUserId
        ? (file: File) =>
            uploadCommentImage(file, { mode: 'internal', userDbId: reviewerUserId })
        : undefined,
    [reviewerUserId],
  )

  return (
    <div className="flex flex-col">
      <div className="mx-auto w-full max-w-[880px] px-4 pt-2 pb-4 sm:px-6 md:pt-4">
        <div className="flex flex-col gap-3 rounded-2xl bg-white px-4 py-4 ring-1 ring-neutral-200 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-neutral-600">
              Reviewing as{' '}
              <span className="font-medium text-neutral-900">{reviewerName}</span>
            </p>
            <div className="flex items-center gap-2">
              {designerControlsSlot}
              {amControlsSlot}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-6 px-4 sm:px-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Left rail: sticky with its own scroll */}
        <div className="lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100dvh-5rem)] lg:overflow-y-auto">
          <InternalReviewRail rows={railRows} selectedPostId={selectedPostId} onSelectPost={selectPost} />
        </div>

        {/* Right column: the canvas */}
        <div className="min-w-0">
          <FeedShell platform={platform} onPlatformChange={setPlatform}>
            {posts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-600">
                No posts in this relay yet.
              </div>
            ) : (
              posts.map(({ post, threads }) => {
                return (
                  <div
                    key={post.id}
                    ref={(el) => {
                      canvasRefs.current[post.id] = el
                    }}
                  >
                    <ReviewPostCard
                      post={post}
                      clientName={clientName}
                      clientAvatarUrl={clientAvatarUrl ?? null}
                      threads={threads}
                      platform={platform}
                      mode="internal"
                      canEditCaption={canEditCaption}
                      allowPostPins={allowPostPins}
                      onCommentChange={() => Promise.resolve(true)}
                      onCaptionEditSave={
                        canEditCaption
                          ? async (draft) => {
                              try {
                                await updatePostAction(post.id, { caption: draft })
                                startTransition(() => router.refresh())
                              } catch (e) {
                                // Thrown server-action errors are masked as an
                                // opaque digest in production; show a generic
                                // friendly message. Re-throw so the card keeps
                                // the editor open with the draft intact.
                                toast.error(
                                  "Couldn't save your changes. You may not have permission to edit captions.",
                                )
                                throw e
                              }
                            }
                          : undefined
                      }
                      onCreatePin={(pin, body, image) =>
                        handleCreatePin(post.id, pin, body, image)
                      }
                      onAppendThreadComment={handleAppendThreadComment}
                      onResolveThread={handleResolveThread}
                      onUseAsPostImage={(commentId) =>
                        handleUseAsPostImage(post.id, commentId)
                      }
                      onUploadImage={handleUploadImage}
                      mentionRoster={mentionRoster}
                    />
                  </div>
                )
              })
            )}
          </FeedShell>
        </div>
      </div>
    </div>
  )
}
