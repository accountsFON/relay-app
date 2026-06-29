'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FeedShell } from '@/components/preview/feed-shell'
import type { Platform } from '@/components/preview/platform-toggle'
import type { FeedPostProps, PinLocation } from '@/types/preview'
import { HeroBand } from '@/components/hero-band'
import { ReviewProgressBar } from '@/components/review/review-progress-bar'
import { ReviewPostCard } from '@/components/review/review-post-card'
import { SubmitReviewBar } from '@/components/review/submit-review-bar'
import { SubmitReviewModal } from '@/components/review/submit-review-modal'
import { ApproveAllButton } from '@/components/review/approve-all-button'
import { ReviewStickyBar } from '@/components/review/review-sticky-bar'
import {
  saveInternalDraftAction,
  submitInternalReviewAction,
} from '@/server/actions/reviewSessions'
import { createThreadAction, addCommentAction } from '@/server/actions/threads'
import type {
  ReviewDecisionType,
  ReviewItemHydrated,
  ReviewSessionStatusType,
  ReviewSessionSummary,
} from '@/types/review-session'

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
  batchLabel: string
  /** The AM's display name (shown in the "Reviewing as" line). */
  reviewerName: string
  posts: ReadonlyArray<InternalReviewShellPost>
  /** Hydrated items from the AM's active internal ReviewSession. */
  initialItems: ReadonlyArray<ReviewItemHydrated>
  /** Status of that session ('in_progress' | 'submitted' | 'superseded' | null). */
  sessionStatus: ReviewSessionStatusType | null
}

/**
 * Clerk-authed AM verdict/submit surface on `/preview`. A sibling of the
 * client `ReviewSessionShell`: same presentational pieces (ProgressBar,
 * ApproveAll, StickyBar, SubmitBar, SubmitModal, FeedShell, ReviewPostCard)
 * and the same optimistic per-post state, but persistence routes through the
 * Phase 1 INTERNAL server actions instead of the magic-link token endpoint:
 *
 *   - verdict/comment/caption -> `saveInternalDraftAction({ batchId, postId, ... })`
 *   - pins/replies -> `createThreadAction` / `addCommentAction` (Clerk-authed,
 *     the same actions today's `/preview` uses)
 *   - submit -> `submitInternalReviewAction({ batchId })`, which (Phase 1)
 *     advances the Design Review step only when the batch is at
 *     `am_review_design` (all approved -> QA; any changes -> notify designer).
 *
 * ReviewPostCard renders in `mode="internal"`, embedding the full post chrome
 * with pins + inline caption edit, so this verdict surface is a SUPERSET of
 * the old raw approval-badge feed (pins are retained, not regressed).
 */
export function InternalReviewShell({
  batchId,
  clientName,
  clientAvatarUrl,
  batchLabel,
  reviewerName,
  posts,
  initialItems,
  sessionStatus,
}: InternalReviewShellProps) {
  const router = useRouter()
  const [platform, setPlatform] = useState<Platform>('instagram')
  const [pending, startTransition] = useTransition()

  // Per-post review state, keyed by postId. Hydrated from server then mutated
  // optimistically (partial shape; missing fields fall back to defaults).
  const [itemsByPostId, setItemsByPostId] = useState<Record<string, ReviewItemHydrated>>(
    () => Object.fromEntries(initialItems.map((it) => [it.postId, it])),
  )

  const [localStatus, setLocalStatus] = useState<ReviewSessionStatusType | null>(
    sessionStatus,
  )

  const [submitModalOpen, setSubmitModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [approvingAll, setApprovingAll] = useState(false)

  const stickySentinelRef = useRef<HTMLDivElement | null>(null)
  const [pinned, setPinned] = useState(false)

  const [saveError, setSaveError] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    const el = stickySentinelRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([entry]) => setPinned(!entry.isIntersecting),
      { threshold: 0 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

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

  /**
   * Persist a per-item change through the internal draft action. Optimistic
   * local update runs first; the action upserts by (reviewSessionId, postId)
   * and lazily creates the session on first write. Returns success so callers
   * can reflect a save-error flag. `decision` is required by the action, so we
   * fall back to the current (or default) verdict for comment-only edits.
   */
  const persistDraft = useCallback(
    async (
      postId: string,
      patch: Partial<Pick<ReviewItemHydrated, 'decision' | 'comment' | 'suggestedCaption'>>,
    ): Promise<boolean> => {
      const prevDecision = itemsByPostId[postId]?.decision ?? 'not_reviewed'

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
          addressedAt: null,
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
        await saveInternalDraftAction({
          batchId,
          postId,
          decision: patch.decision ?? prevDecision,
          comment: patch.comment,
          suggestedCaption: patch.suggestedCaption,
        })
        return true
      } catch (err) {
        console.error('[internal-review-shell] saveInternalDraftAction failed', err)
        return false
      }
    },
    [batchId, itemsByPostId],
  )

  const reflectSave = useCallback((ok: boolean) => {
    setSaveError(!ok)
  }, [])

  const handleDecisionChange = useCallback(
    (postId: string, decision: ReviewDecisionType) => {
      const patch =
        decision === 'approved'
          ? { decision, suggestedCaption: null }
          : { decision }
      void persistDraft(postId, patch).then(reflectSave)
    },
    [persistDraft, reflectSave],
  )

  const handleApproveAll = useCallback(async () => {
    const overrideCount = summary.changesRequested + summary.captionEdited
    if (
      overrideCount > 0 &&
      !window.confirm(
        `Approve all ${summary.totalPosts} posts? This will discard your ` +
          `changes on ${overrideCount} post${overrideCount === 1 ? '' : 's'}.`,
      )
    ) {
      return
    }
    setApprovingAll(true)
    try {
      const results = await Promise.all(
        postIds
          .filter((id) => {
            const it = itemsByPostId[id]
            return !(it?.decision === 'approved' && !it?.suggestedCaption)
          })
          .map((id) =>
            persistDraft(id, { decision: 'approved', suggestedCaption: null }),
          ),
      )
      reflectSave(results.every(Boolean))
    } finally {
      setApprovingAll(false)
    }
  }, [summary, postIds, itemsByPostId, persistDraft, reflectSave])

  const handleCommentChange = useCallback(
    (postId: string, comment: string): Promise<boolean> =>
      persistDraft(postId, { comment: comment.length > 0 ? comment : null }),
    [persistDraft],
  )

  const handleCaptionEditSave = useCallback(
    async (postId: string, newCaption: string) => {
      const ok = await persistDraft(postId, {
        decision: 'caption_edited',
        suggestedCaption: newCaption,
      })
      reflectSave(ok)
    },
    [persistDraft, reflectSave],
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

  const handleSubmitClick = useCallback(() => {
    setSubmitError(null)
    setSubmitModalOpen(true)
  }, [])

  const handleSubmitConfirm = useCallback(async () => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      await submitInternalReviewAction({ batchId })
      setLocalStatus('submitted')
      setSubmitModalOpen(false)
      startTransition(() => router.refresh())
    } catch (err) {
      console.error('[internal-review-shell] submitInternalReviewAction failed:', err)
      setSubmitError(
        "We couldn't submit your review. Please refresh the page and try again.",
      )
    } finally {
      setSubmitting(false)
    }
  }, [batchId, router, startTransition])

  const handleSubmitCancel = useCallback(() => {
    setSubmitError(null)
    setSubmitModalOpen(false)
  }, [])

  // Submitted = locked verdict surface. Pins + thread replies stay live so the
  // AM can keep discussing with the designer; verdict/Notes/Edit-copy lock.
  const locked = localStatus === 'submitted'

  const postsCountLabel = `${posts.length} ${posts.length === 1 ? 'post' : 'posts'}`
  const heroTitle = batchLabel.toLowerCase().includes(clientName.toLowerCase())
    ? batchLabel
    : `${clientName} · ${batchLabel}`

  return (
    <div className="flex flex-col">
      {!locked && pinned ? (
        <ReviewStickyBar
          reviewed={itemsReviewed}
          total={summary.totalPosts}
          allApproved={
            summary.totalPosts > 0 && summary.approved === summary.totalPosts
          }
          pending={approvingAll || submitting || pending}
          onApproveAll={handleApproveAll}
        />
      ) : null}

      {saveError ? (
        <div className="mx-auto w-full max-w-[880px] px-4 pt-2 sm:px-6">
          <div
            data-testid="review-save-error"
            role="alert"
            className="flex items-start justify-between gap-3 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <span>
              We couldn&apos;t save your last change. Please refresh the page and
              try again.
            </span>
            <button
              type="button"
              onClick={() => setSaveError(false)}
              className="shrink-0 font-medium underline underline-offset-2"
              aria-label="Dismiss"
            >
              Dismiss
            </button>
          </div>
        </div>
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
          <ReviewProgressBar postIds={postIds} itemsByPostId={itemsByPostId} />
          {!locked ? (
            <ApproveAllButton
              totalPosts={summary.totalPosts}
              allApproved={
                summary.totalPosts > 0 && summary.approved === summary.totalPosts
              }
              pending={approvingAll || submitting || pending}
              onApproveAll={handleApproveAll}
            />
          ) : null}
        </div>
        <div ref={stickySentinelRef} aria-hidden className="h-0" />
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
                mode="internal"
                disabled={pending || submitting}
                locked={locked}
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
              />
            )
          })
        )}
      </FeedShell>

      {!locked ? (
        <SubmitReviewBar
          summary={summary}
          onSubmit={handleSubmitClick}
          submitting={submitting}
        />
      ) : null}

      {!locked ? (
        <SubmitReviewModal
          open={submitModalOpen}
          summary={summary}
          pendingCount={pendingCount}
          onConfirm={handleSubmitConfirm}
          onCancel={handleSubmitCancel}
          submitting={submitting}
          error={submitError}
        />
      ) : null}
    </div>
  )
}
