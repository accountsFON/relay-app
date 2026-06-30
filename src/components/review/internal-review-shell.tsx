'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { FeedShell } from '@/components/preview/feed-shell'
import type { Platform } from '@/components/preview/platform-toggle'
import type { FeedPostProps, PinLocation } from '@/types/preview'
import { HeroBand } from '@/components/hero-band'
import { ReviewProgressBar } from '@/components/review/review-progress-bar'
import { ReviewPostCard } from '@/components/review/review-post-card'
import { InternalReviewRail, type InternalRailRow } from '@/components/review/internal-review-rail'
import { SubmitReviewBar } from '@/components/review/submit-review-bar'
import { SubmitReviewModal } from '@/components/review/submit-review-modal'
import { ApproveAllButton } from '@/components/review/approve-all-button'
import { ReviewStickyBar } from '@/components/review/review-sticky-bar'
import {
  saveInternalDraftAction,
  submitInternalReviewAction,
  type SubmitInternalReviewActionResult,
} from '@/server/actions/reviewSessions'
import {
  createThreadAction,
  addCommentAction,
  resolveThreadAction,
  // Aliased: the source export starts with `use`, which trips the
  // react-hooks/rules-of-hooks linter when called inside a useCallback. It is
  // a server action, not a hook.
  useCommentImageAsPostMediaAction as applyCommentImageAsPostMediaAction,
} from '@/server/actions/threads'
import { uploadCommentImage } from '@/lib/upload-comment-image'
import type { MentionTarget } from '@/lib/mentions'
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
  /**
   * The AM's database user id. Enables image-attach in the pin composers
   * (uploads go to comment-images/am/<userDbId>/), exactly as the legacy
   * /preview shell did. When omitted, the attach button is suppressed.
   */
  reviewerUserId?: string
  /**
   * Internal @-mention roster (AM + designer + admins) for this client. Passed
   * into the pin composers' @-autocomplete. The page already fetches this; it
   * was previously discarded for editors.
   */
  mentionRoster?: MentionTarget[]
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
  reviewerUserId,
  mentionRoster = [],
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
  // Soft warning: submit succeeded but the state-machine advance failed. The
  // session is still submitted; this is a non-blocking notice, not an error.
  const [advanceError, setAdvanceError] = useState<string | null>(null)

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
        const decision = itemsByPostId[post.id]?.decision
        const verdict: InternalRailRow['verdict'] =
          decision === 'approved'
            ? 'approved'
            : decision === 'changes_requested'
              ? 'changes_requested'
              : decision === 'caption_edited'
                ? 'caption_edited'
                : 'pending'
        return {
          postId: post.id,
          postNumber: idx + 1,
          thumbnailUrl: post.mediaUrl ?? null,
          verdict,
          pinCount: (threads ?? []).length,
        }
      }),
    [posts, itemsByPostId],
  )

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

  /**
   * Resolve an AM pin/thread from the feed popover, via the Clerk-authed
   * `resolveThreadAction` (the same action today's /preview uses), then refresh
   * so the resolved state hydrates back onto the card.
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
   * Promote a comment's attached image to the post media. Scoped per post so
   * the action receives the right `postId`. Refreshes to pull the new media.
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

  // Image-attach in the pin composers. Built once; undefined when no
  // reviewerUserId (graceful degradation: the attach button just won't render),
  // exactly as the legacy /preview shell did it.
  const handleUploadImage = useMemo(
    () =>
      reviewerUserId
        ? (file: File) =>
            uploadCommentImage(file, { mode: 'internal', userDbId: reviewerUserId })
        : undefined,
    [reviewerUserId],
  )

  const handleSubmitClick = useCallback(() => {
    setSubmitError(null)
    setSubmitModalOpen(true)
  }, [])

  const handleSubmitConfirm = useCallback(async () => {
    setSubmitting(true)
    setSubmitError(null)
    setAdvanceError(null)
    try {
      const result: SubmitInternalReviewActionResult =
        await submitInternalReviewAction({ batchId })
      setLocalStatus('submitted')
      // Soft warning: the review IS submitted, but the relay didn't advance.
      // Surface a non-blocking notice rather than failing the whole submit.
      setAdvanceError(result.advanceError ?? null)
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
      {locked ? (
        <div className="mx-auto w-full max-w-[880px] px-4 pt-2 sm:px-6">
          <div
            data-testid="review-submitted-banner"
            role="status"
            className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          >
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            <span>
              Review submitted. You can still resolve pins and discuss changes
              with the designer below.
            </span>
          </div>
        </div>
      ) : null}

      {advanceError ? (
        <div className="mx-auto w-full max-w-[880px] px-4 pt-2 sm:px-6">
          <div
            data-testid="review-advance-error"
            role="status"
            className="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <span>
              Your review was submitted, but the relay didn&apos;t advance to the
              next step automatically. Open the relay to move it forward manually.
            </span>
            <button
              type="button"
              onClick={() => setAdvanceError(null)}
              className="shrink-0 font-medium underline underline-offset-2"
              aria-label="Dismiss"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

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

      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-6 px-4 sm:px-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Left rail: sticky with its own scroll */}
        <div className="lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100dvh-5rem)] lg:overflow-y-auto">
          <InternalReviewRail rows={railRows} selectedPostId={selectedPostId} onSelectPost={selectPost} />
        </div>

        {/* Right column: the existing canvas, unchanged */}
        <div className="min-w-0">
          <FeedShell platform={platform} onPlatformChange={setPlatform}>
            {posts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-600">
                No posts in this relay yet.
              </div>
            ) : (
              posts.map(({ post, threads }) => {
                const reviewItem = itemsByPostId[post.id]
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
