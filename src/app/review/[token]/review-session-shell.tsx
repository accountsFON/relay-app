'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FeedShell } from '@/components/preview/feed-shell'
import type { Platform } from '@/components/preview/platform-toggle'
import type { FeedPostProps } from '@/types/preview'
import { ReviewProgressBar } from '@/components/review/review-progress-bar'
import { ReviewPostCard } from '@/components/review/review-post-card'
import { SubmitReviewBar } from '@/components/review/submit-review-bar'
import { SubmitReviewModal } from '@/components/review/submit-review-modal'
import { ReviewSubmittedScreen } from '@/components/review/review-submitted-screen'
import { ReturningReviewerBanner } from '@/components/review/returning-reviewer-banner'
import { CaptionEditBottomSheet } from '@/components/review/caption-edit-bottom-sheet'
import { submitSessionAction } from '@/server/actions/reviewSessions'
import type {
  ReviewDecisionType,
  ReviewItemHydrated,
  ReviewSessionStatusType,
  ReviewSessionSummary,
} from '@/types/review-session'

export type ReviewSessionShellPost = {
  post: FeedPostProps['post']
}

export type ReviewSessionShellProps = {
  token: string
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

  // postId of the post currently being captioned-edited. null = sheet closed.
  const [editingPostId, setEditingPostId] = useState<string | null>(null)

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
      // Edit Copy is the only decision that needs a follow-up input from the
      // reviewer. Open the bottom sheet so they can type the suggested caption
      // in the same gesture, rather than tapping the post-card hint pill after.
      if (decision === 'caption_edited') {
        setEditingPostId(postId)
      }
    },
    [persistDraft],
  )

  const handleCommentChange = useCallback(
    (postId: string, comment: string) => {
      void persistDraft(postId, { comment: comment.length > 0 ? comment : null })
    },
    [persistDraft],
  )

  const handleCaptionEditStart = useCallback((postId: string) => {
    setEditingPostId(postId)
  }, [])

  const handleCaptionEditCancel = useCallback(() => {
    setEditingPostId(null)
  }, [])

  const handleCaptionEditSave = useCallback(
    async (newCaption: string) => {
      const postId = editingPostId
      if (!postId) return
      await persistDraft(postId, {
        decision: 'caption_edited',
        suggestedCaption: newCaption,
      })
      setEditingPostId(null)
    },
    [editingPostId, persistDraft],
  )

  const editingPost = useMemo(
    () => (editingPostId ? posts.find((p) => p.post.id === editingPostId) : undefined),
    [editingPostId, posts],
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

  return (
    <div className="flex flex-col">
      {showReturningBanner ? (
        <ReturningReviewerBanner
          itemsReviewed={itemsReviewed}
          totalPosts={summary.totalPosts}
        />
      ) : null}

      <div className="border-b border-border bg-card/40">
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-base font-semibold text-foreground">{batchLabel}</h1>
            <p className="text-xs text-muted-foreground">
              Reviewing as{' '}
              <span className="font-medium text-foreground">{reviewerName}</span>
            </p>
          </div>
          <ReviewProgressBar
            postIds={postIds}
            itemsByPostId={itemsByPostId}
          />
        </div>
      </div>

      <FeedShell platform={platform} onPlatformChange={setPlatform}>
        {posts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No posts in this batch yet.
          </div>
        ) : (
          posts.map(({ post }) => {
            const reviewItem = itemsByPostId[post.id]
            return (
              <ReviewPostCard
                key={post.id}
                post={post}
                clientName={clientName}
                clientAvatarUrl={clientAvatarUrl ?? null}
                reviewItem={reviewItem}
                platform={platform}
                mode="review"
                disabled={pending || submitting}
                onDecisionChange={(decision) =>
                  handleDecisionChange(post.id, decision)
                }
                onCommentChange={(comment) =>
                  handleCommentChange(post.id, comment)
                }
                onCaptionEditStart={() => handleCaptionEditStart(post.id)}
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

      <CaptionEditBottomSheet
        open={editingPostId !== null && editingPost !== undefined}
        originalCaption={editingPost?.post.caption ?? ''}
        initialDraft={
          editingPostId
            ? itemsByPostId[editingPostId]?.suggestedCaption ?? undefined
            : undefined
        }
        onSave={handleCaptionEditSave}
        onCancel={handleCaptionEditCancel}
      />
    </div>
  )
}
