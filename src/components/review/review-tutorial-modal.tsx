'use client'

import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TourPopover, type TourStop } from '@/components/onboarding/tour-popover'

export type ReviewTutorialModalProps = {
  className?: string
}

type Step = 'welcome' | 'tour'

/**
 * Client review onboarding tutorial. Shows on EVERY load of the review surface
 * (no persistence) with a Skip. Covers the review features: decision buttons,
 * image + caption-text pin comments, and submit.
 *
 * Two steps: a welcome card (text intro), then an in-page ANCHORED TOOLTIP
 * tour that points at the real review controls (post, decision buttons, submit
 * bar). The tour replaced an explainer video that depended on a recording that
 * was never produced; anchored tooltips teach the same thing in-context and
 * never go stale.
 */
const REVIEW_TOUR_STOPS: TourStop[] = [
  {
    id: 'comment',
    anchorSelector: '[data-testid="review-post-card"]',
    title: 'Comment on a post',
    body: 'Click anywhere on the image to drop a pin, or select caption text, to leave a comment on that exact spot.',
  },
  {
    id: 'decide',
    anchorSelector: '[data-testid="decision-button-row"]',
    title: 'Approve or request changes',
    body: 'Under each post, tap Approve, Changes, or Edit Copy to give your verdict.',
  },
  {
    id: 'submit',
    anchorSelector: '[data-testid="review-submit-bar"]',
    title: "Submit when you're done",
    body: 'Once you have gone through every post, hit Submit Review. Your team gets one email.',
  },
]

export function ReviewTutorialModal({ className }: ReviewTutorialModalProps) {
  const [open, setOpen] = useState(true)
  const [step, setStep] = useState<Step>('welcome')
  const [tourIndex, setTourIndex] = useState(0)

  const handleDismiss = useCallback(() => setOpen(false), [])
  const handleStartTour = useCallback(() => {
    setTourIndex(0)
    setStep('tour')
  }, [])
  const handleTourNext = useCallback(() => {
    setTourIndex((i) => {
      if (i >= REVIEW_TOUR_STOPS.length - 1) {
        setOpen(false)
        return i
      }
      return i + 1
    })
  }, [])

  // ESC closes the welcome card. The tour step handles its own ESC inside
  // TourPopover (wired to onClose below), so only listen on the welcome step.
  useEffect(() => {
    if (!open || step !== 'welcome') return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleDismiss()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, step, handleDismiss])

  if (!open) return null

  // Tour step: render only the anchored popover over the live page (no
  // backdrop) so the client can see the controls the tooltips point at.
  if (step === 'tour') {
    return (
      <TourPopover
        stops={REVIEW_TOUR_STOPS}
        currentIndex={tourIndex}
        onNext={handleTourNext}
        onSkip={handleDismiss}
        onClose={handleDismiss}
      />
    )
  }

  return (
    <div
      data-testid="review-tutorial-modal"
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-4',
        className,
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-tutorial-title"
    >
      <div className="relative w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl">
        <button
          type="button"
          aria-label="Skip tutorial"
          data-testid="review-tutorial-modal-close"
          onClick={handleDismiss}
          className="absolute right-3 top-3 rounded-full p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
        >
          <X aria-hidden className="size-4" />
        </button>

        <div data-testid="review-tutorial-modal-welcome">
          <div className="flex h-[180px] w-full items-center justify-center overflow-hidden rounded-xl bg-neutral-100">
            <img
              src="/brand/review-tutorial-welcome.svg"
              alt=""
              className="max-h-full max-w-full"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          </div>
          <h2
            id="review-tutorial-title"
            className="mt-4 text-lg font-semibold text-foreground"
          >
            Here&apos;s how this works.
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-foreground">
            <li>
              Tap <strong>Approve</strong>, <strong>Changes</strong>, or{' '}
              <strong>Edit Copy</strong> under each post.
            </li>
            <li>Click an image to comment on the design.</li>
            <li>Select caption text to comment on the wording.</li>
            <li>
              Hit <strong>Submit Review</strong> when you&apos;re done. Your team
              gets one email.
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
              data-testid="review-tutorial-modal-show-tour"
              onClick={handleStartTour}
              className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-neutral-50"
            >
              Show me how
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
