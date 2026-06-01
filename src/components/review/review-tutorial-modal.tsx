'use client'

import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ReviewTutorialModalProps = {
  /** Magic link URL token. Used to POST mark-seen on dismiss. */
  token: string
  /** Whether this reviewer has already dismissed the tutorial. */
  seen: boolean
  /**
   * Optional override for the mark-seen network call. Tests inject a stub
   * so the component does not need a real fetch implementation.
   */
  onMarkSeen?: () => Promise<void> | void
  className?: string
}

type Step = 'welcome' | 'video'

const VIDEO_SRC_MP4 = '/tutorial/review-markup.mp4'
const VIDEO_SRC_WEBM = '/tutorial/review-markup.webm'
const VIDEO_POSTER = '/tutorial/review-markup.jpg'

/**
 * First visit tutorial modal for the v2 client review surface.
 *
 * Renders only when the reviewer's `MagicLinkReviewer.tutorialSeenAt` is
 * null. Two steps:
 *
 *   1. Welcome card: title, 3 line copy, primary "Got it, let's go"
 *      button, secondary "Show me how" that swaps to the video step.
 *   2. Video step: autoplay muted loop MP4 (with WebM source +
 *      JPG poster), single "Got it" button.
 *
 * Skip mechanics:
 *   - Tapping the top right X closes the modal AND persists tutorialSeenAt.
 *   - Tapping "Got it" on either step does the same.
 *   - There is no "remind me later"; once dismissed the modal will not
 *     fire again for this reviewer.
 *
 * The mark-seen POST runs fire and forget. The modal closes optimistically
 * so a flaky network does not block the reviewer; worst case is two
 * tutorial views on a re visit if the POST never landed.
 *
 * Asset note: as of the Phase 4 item 24 ship the MP4 + WebM + poster
 * files are placeholders. The component renders the video element
 * regardless so the infrastructure is in place; Julio records the
 * actual demo against the demo agency in a follow up.
 */
export function ReviewTutorialModal({
  token,
  seen,
  onMarkSeen,
  className,
}: ReviewTutorialModalProps) {
  const [open, setOpen] = useState(!seen)
  const [step, setStep] = useState<Step>('welcome')

  // If the parent prop flips from unseen to seen (e.g. router.refresh
  // after a successful mark-seen) make sure we honor it and unmount.
  useEffect(() => {
    if (seen) setOpen(false)
  }, [seen])

  const persistSeen = useCallback(async () => {
    if (onMarkSeen) {
      try {
        await onMarkSeen()
      } catch (err) {
        console.error('[review-tutorial-modal] onMarkSeen threw', err)
      }
      return
    }
    try {
      await fetch(
        `/api/review/${encodeURIComponent(token)}/tutorial-seen`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Empty body, the route reads the reviewer from the session cookie.
          body: '{}',
        },
      )
    } catch (err) {
      // Optimistic dismiss: a failed POST means the modal may re-fire
      // on the next visit. Acceptable per the design.
      console.error('[review-tutorial-modal] mark-seen POST threw', err)
    }
  }, [token, onMarkSeen])

  const handleDismiss = useCallback(() => {
    setOpen(false)
    void persistSeen()
  }, [persistSeen])

  const handleShowVideo = useCallback(() => {
    setStep('video')
  }, [])

  if (!open) return null

  return (
    <div
      data-testid="review-tutorial-modal"
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4',
        className,
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-tutorial-title"
    >
      <div className="relative w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl">
        <button
          type="button"
          aria-label="Close tutorial"
          data-testid="review-tutorial-modal-close"
          onClick={handleDismiss}
          className="absolute right-3 top-3 rounded-full p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
        >
          <X aria-hidden className="size-4" />
        </button>

        {step === 'welcome' ? (
          <div data-testid="review-tutorial-modal-welcome">
            <div className="mb-4 flex h-[180px] w-full items-center justify-center overflow-hidden rounded-xl bg-neutral-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/review-tutorial-welcome.svg"
                alt=""
                aria-hidden
                className="h-full w-full object-cover"
                onError={(e) => {
                  // Asset is a placeholder until Julio publishes the final
                  // SVG; on a 404 hide the broken image gracefully.
                  e.currentTarget.style.display = 'none'
                }}
              />
            </div>
            <h2
              id="review-tutorial-title"
              className="text-lg font-semibold text-foreground"
            >
              Here&apos;s how this works.
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-foreground">
              <li>
                Tap <strong>Approve</strong>, <strong>Changes</strong>, or{' '}
                <strong>Edit Copy</strong> under each post.
              </li>
              <li>
                Click the image or caption to pin a comment on the part that
                needs work.
              </li>
              <li>
                Hit <strong>Submit Review</strong> when you&apos;re done. Your
                team gets one email.
              </li>
            </ul>
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                data-testid="review-tutorial-modal-got-it"
                onClick={handleDismiss}
                className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Got it, let&apos;s go
              </button>
              <button
                type="button"
                data-testid="review-tutorial-modal-show-video"
                onClick={handleShowVideo}
                className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-neutral-50"
              >
                Show me how (15 sec video)
              </button>
            </div>
          </div>
        ) : (
          <div data-testid="review-tutorial-modal-video">
            <h2
              id="review-tutorial-title"
              className="text-lg font-semibold text-foreground"
            >
              Drop a pin on what needs work.
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Click the image or caption to leave a precise comment.
            </p>
            <div className="mt-4 aspect-video w-full overflow-hidden rounded-xl bg-neutral-900">
              <video
                data-testid="review-tutorial-modal-video-el"
                className="h-full w-full"
                autoPlay
                muted
                loop
                playsInline
                poster={VIDEO_POSTER}
              >
                <source src={VIDEO_SRC_WEBM} type="video/webm" />
                <source src={VIDEO_SRC_MP4} type="video/mp4" />
              </video>
            </div>
            <div className="mt-6">
              <button
                type="button"
                data-testid="review-tutorial-modal-got-it-video"
                onClick={handleDismiss}
                className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
