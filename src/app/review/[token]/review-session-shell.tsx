'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FeedShell } from '@/components/preview/feed-shell'
import type { Platform } from '@/components/preview/platform-toggle'
import type { FeedPostProps, PinLocation } from '@/types/preview'
import { HeroBand } from '@/components/hero-band'
import { ReviewProgressBar } from '@/components/review/review-progress-bar'
import { ReviewPostCard } from '@/components/review/review-post-card'
import { SubmitReviewBar } from '@/components/review/submit-review-bar'
import { SubmitReviewModal } from '@/components/review/submit-review-modal'
import { ReviewSubmittedScreen } from '@/components/review/review-submitted-screen'
import { ReturningReviewerBanner } from '@/components/review/returning-reviewer-banner'
import { ReviewTutorialModal } from '@/components/review/review-tutorial-modal'
import { submitSessionAction } from '@/server/actions/reviewSessions'
import {
  addCommentAsReviewer,
  leaveCommentAsReviewer,
} from '@/app/review/[token]/_actions'
import { uploadCommentImage } from '@/lib/upload-comment-image'
import type {
  ReviewDecisionType,
  ReviewItemHydrated,
  ReviewSessionStatusType,
  ReviewSessionSummary,
} from '@/types/review-session'

export type ReviewSessionShellPost = {
  post: FeedPostProps['post']
  /**
   * Hydrated open threads on the post (image pins, caption pins,
   * post-level threads). Used by the v2 client surface to render
   * existing reviewer pins as numbered badges over the image and
   * highlight ranges in the caption. Defaults to an empty array.
   */
  threads?: FeedPostProps['threads']
}

export type ReviewSessionShellProps = {
  token: string
  /**
   * sha256(token) — computed by the server page (which has the raw token)
   * and passed down so the client shell can build reviewer upload pathnames
   * without ever recomputing the hash on the client (and without exposing
   * the hash as a secret — it is not secret).
   */
  tokenHash: string
  clientName: string
  clientAvatarUrl?: string | null
  batchLabel: string
  reviewerName: string
  amName: string
  posts: ReadonlyArray<ReviewSessionShellPost>
  /** Hydrated items from the most-recent ReviewSession for this reviewer. */
  initialItems: ReadonlyArray<ReviewItemHydrated>
  /** Status of that session ('in_progress' | 'submitted' | 'superseded' | null). */
  sessionStatus: ReviewSessionStatusType | null
  /** Summary snapshot from a submitted session (renders the thanks screen). */
  submittedSummary?: ReviewSessionSummary | null
}

/**
 * Client-side composition of the v2 client review surface.
 *
 * Holds:
 *   - platform toggle state (IG default)
 *   - optimistic per-post review state mirrored from server
 *   - submit modal + submitted-screen visibility
 *
 * Persists every decision/comment/caption change to /api/review/[token]/draft.
 * The draft API upserts by (reviewSessionId, postId), so optimistic writes are
 * always safely replayable.
 *
 * Final submit wiring (server action) is owned by Task 2.5; for now we route
 * to a stub that flips the local sessionStatus to `submitted` so the UI can
 * be QA'd end-to-end. The actual server action will replace the stub call
 * site in Task 2.5 without changing the component contract.
 */
export function ReviewSessionShell({
  token,
  tokenHash,
  clientName,
  clientAvatarUrl,
  batchLabel,
  reviewerName,
  amName,
  posts,
  initialItems,
  sessionStatus,
  submittedSummary,
}: ReviewSessionShellProps) {
  const router = useRouter()
  const [platform, setPlatform] = useState<Platform>('instagram')
  const [pending, startTransition] = useTransition()

  // Per-post review state, keyed by postId. Hydrated from server then mutated
  // optimistically. The optimistic shape is partial -- only the fields we
  // actually edit live here; missing fields fall back to defaults.
  const [itemsByPostId, setItemsByPostId] = useState<Record<string, ReviewItemHydrated>>(
    () => Object.fromEntries(initialItems.map((it) => [it.postId, it])),
  )

  // UI-only local status: starts as the server's value but flips to
  // 'submitted' optimistically once the reviewer confirms. We do NOT roll
  // back on error -- if the network fails the parent page reload (router
  // refresh) re-syncs from server truth.
  const [localStatus, setLocalStatus] = useState<ReviewSessionStatusType | null>(
    sessionStatus,
  )
  const [localSummary, setLocalSummary] = useState<ReviewSessionSummary | null>(
    submittedSummary ?? null,
  )

  const [submitModalOpen, setSubmitModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const postIds = useMemo(() => posts.map((p) => p.post.id), [posts])

  const summary: ReviewSessionSummary = useMemo(() => {
    let approved = 0
    let changesRequested = 0
    let captionEdited = 0
    for (const id of postIds) {
      const decision = itemsByPostId[id]?.decision ?? 'not_reviewed'
      if (decision === 'approved') approved += 1
      else if (decision === 'changes_requested') changesRequested += 1
      else if (decision === 'caption_edited') captionEdited += 1
    }
    return {
      approved,
      changesRequested,
      captionEdited,
      totalPosts: postIds.length,
    }
  }, [postIds, itemsByPostId])

  const itemsReviewed =
    summary.approved + summary.changesRequested + summary.captionEdited
  const pendingCount = summary.totalPosts - itemsReviewed

  const showReturningBanner =
    localStatus === 'in_progress' && itemsReviewed > 0

  /**
   * Persist a per-item change to the draft endpoint. Optimistic local update
   * runs first; on failure we log and refresh from server.
   */
  const persistDraft = useCallback(
    async (postId: string, patch: Partial<Pick<ReviewItemHydrated, 'decision' | 'comment' | 'suggestedCaption'>>) => {
      // Optimistic merge into local state.
      setItemsByPostId((prev) => {
        const existing: ReviewItemHydrated = prev[postId] ?? {
          id: `optimistic-${postId}`,
          postId,
          decision: 'not_reviewed',
          comment: null,
          suggestedCaption: null,
          acceptedAsPostVersionId: null,
          updatedSinceLastReview: false,
          lastReviewedVersionId: null,
          reviewedAt: new Date(),
        }
        return {
          ...prev,
          [postId]: {
            ...existing,
            decision: patch.decision ?? existing.decision,
            comment: patch.comment !== undefined ? patch.comment : existing.comment,
            suggestedCaption:
              patch.suggestedCaption !== undefined
                ? patch.suggestedCaption
                : existing.suggestedCaption,
            reviewedAt: new Date(),
          },
        }
      })

      try {
        const res = await fetch(`/api/review/${encodeURIComponent(token)}/draft`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ postId, ...patch }),
        })
        if (!res.ok) {
          // 410 = link revoked; force a refresh so the server can render the
          // appropriate not-found / revoked surface.
          if (res.status === 410 || res.status === 401) {
            startTransition(() => router.refresh())
            return
          }
          console.error('[review-session-shell] draft save failed', res.status)
        }
      } catch (err) {
        console.error('[review-session-shell] draft save threw', err)
      }
    },
    [token, router, startTransition],
  )

  const handleDecisionChange = useCallback(
    (postId: string, decision: ReviewDecisionType) => {
      void persistDraft(postId, { decision })
    },
    [persistDraft],
  )

  const handleCommentChange = useCallback(
    (postId: string, comment: string) => {
      void persistDraft(postId, { comment: comment.length > 0 ? comment : null })
    },
    [persistDraft],
  )

  const handleCaptionEditSave = useCallback(
    async (postId: string, newCaption: string) => {
      await persistDraft(postId, {
        decision: 'caption_edited',
        suggestedCaption: newCaption,
      })
    },
    [persistDraft],
  )

  /**
   * Drop a reviewer pin on a post. Persists as a `PostThread` row via the
   * `leaveCommentAsReviewer` server action (author.kind = 'reviewer'),
   * then refreshes the page so the new thread hydrates onto the card.
   */
  const handleCreatePin = useCallback(
    async (
      postId: string,
      pin: PinLocation,
      body: string,
      image?: { url: string; width?: number; height?: number },
    ) => {
      try {
        await leaveCommentAsReviewer({ token, postId, pin, body, image })
        startTransition(() => router.refresh())
      } catch (err) {
        console.error('[review-session-shell] leaveCommentAsReviewer failed', err)
      }
    },
    [token, router, startTransition],
  )

  /**
   * Append a comment to an existing thread on a post. Mirrors handleCreatePin
   * but routes to `addCommentAsReviewer` since the thread already exists.
   */
  const handleAppendThreadComment = useCallback(
    async (
      threadId: string,
      body: string,
      image?: { url: string; width?: number; height?: number },
    ) => {
      try {
        await addCommentAsReviewer({ token, threadId, body, image })
        startTransition(() => router.refresh())
      } catch (err) {
        console.error('[review-session-shell] addCommentAsReviewer failed', err)
      }
    },
    [token, router, startTransition],
  )

  // Build the reviewer image upload helper using the token + its hash.
  // The pathname is built client-side under the reviewer's tokenHash prefix;
  // the route validates the prefix in onBeforeGenerateToken.
  const handleUploadImage = useCallback(
    (file: File) =>
      uploadCommentImage(file, { mode: 'review', token, tokenHash }),
    [token, tokenHash],
  )

  const handleSubmitClick = useCallback(() => {
    setSubmitModalOpen(true)
  }, [])

  const handleSubmitConfirm = useCallback(async () => {
    setSubmitting(true)
    try {
      // Real server action from Task 2.5 (PR #118): flips session status,
      // persists summary, sends digest email via Resend, emits activity.
      const result = await submitSessionAction({ token })
      setLocalStatus('submitted')
      setLocalSummary(result.summary ?? summary)
      setSubmitModalOpen(false)
      startTransition(() => router.refresh())
    } catch (err) {
      console.error('[review-session-shell] submitSessionAction failed:', err)
    } finally {
      setSubmitting(false)
    }
  }, [token, summary, router, startTransition])

  const handleSubmitCancel = useCallback(() => {
    setSubmitModalOpen(false)
  }, [])

  // Submitted-state branch: replace the whole surface with the thanks screen.
  if (localStatus === 'submitted') {
    return (
      <ReviewSubmittedScreen
        summary={localSummary ?? summary}
        amName={amName}
      />
    )
  }

  const postsCountLabel = `${posts.length} ${posts.length === 1 ? 'post' : 'posts'}`
  // Some batch labels already include the client name (e.g. "Old Mill
  // Brewing Co March 2026"). Avoid stuttering the client name in the hero
  // title by reusing the label verbatim in that case.
  const heroTitle = batchLabel.toLowerCase().includes(clientName.toLowerCase())
    ? batchLabel
    : `${clientName} · ${batchLabel}`

  // Client tutorial fires on EVERY load of the active review surface (no
  // persistence). It mounts unconditionally here; this JSX only renders when
  // the session is not submitted (the submitted branch returns early above),
  // so the modal never stacks on the thanks screen. The reviewer can Skip it.
  return (
    <div className="flex flex-col">
      <ReviewTutorialModal />
      {showReturningBanner ? (
        <ReturningReviewerBanner
          itemsReviewed={itemsReviewed}
          totalPosts={summary.totalPosts}
        />
      ) : null}

      <div className="mx-auto w-full max-w-[880px] px-4 pt-2 pb-4 sm:px-6 md:pt-4">
        <HeroBand
          title={heroTitle}
          subtitle={`Reviewing ${postsCountLabel}. Leave feedback on any post, then submit when you're done.`}
        />
        <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-white px-4 py-4 ring-1 ring-neutral-200 sm:px-6">
          <p className="text-xs text-neutral-600">
            Reviewing as{' '}
            <span className="font-medium text-neutral-900">{reviewerName}</span>
          </p>
          <ReviewProgressBar
            postIds={postIds}
            itemsByPostId={itemsByPostId}
          />
        </div>
      </div>

      <FeedShell platform={platform} onPlatformChange={setPlatform}>
        {posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-600">
            No posts in this relay yet.
          </div>
        ) : (
          posts.map(({ post, threads }) => {
            const reviewItem = itemsByPostId[post.id]
            return (
              <ReviewPostCard
                key={post.id}
                post={post}
                clientName={clientName}
                clientAvatarUrl={clientAvatarUrl ?? null}
                reviewItem={reviewItem}
                threads={threads}
                platform={platform}
                mode="review"
                disabled={pending || submitting}
                onDecisionChange={(decision) =>
                  handleDecisionChange(post.id, decision)
                }
                onCommentChange={(comment) =>
                  handleCommentChange(post.id, comment)
                }
                onCaptionEditSave={(draft) =>
                  handleCaptionEditSave(post.id, draft)
                }
                onCreatePin={(pin, body, image) =>
                  handleCreatePin(post.id, pin, body, image)
                }
                onAppendThreadComment={handleAppendThreadComment}
                onUploadImage={handleUploadImage}
              />
            )
          })
        )}
      </FeedShell>

      <SubmitReviewBar
        summary={summary}
        onSubmit={handleSubmitClick}
        submitting={submitting}
      />

      <SubmitReviewModal
        open={submitModalOpen}
        summary={summary}
        pendingCount={pendingCount}
        onConfirm={handleSubmitConfirm}
        onCancel={handleSubmitCancel}
        submitting={submitting}
      />
    </div>
  )
}
