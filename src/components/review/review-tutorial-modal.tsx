'use client'

import { useCallback, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ReviewTutorialModalProps = {
  className?: string
}

type Step = 'welcome' | 'video'

const VIDEO_SRC_MP4 = '/tutorial/review-markup.mp4'
const VIDEO_SRC_WEBM = '/tutorial/review-markup.webm'
const VIDEO_POSTER = '/tutorial/review-markup.jpg'

/**
 * Client review onboarding tutorial. Shows on EVERY load of the review surface
 * (no persistence) with a Skip. Covers the review features: decision buttons,
 * image + caption-text pin comments, and submit. The welcome image + demo
 * video assets are placeholders.
 */
export function ReviewTutorialModal({ className }: ReviewTutorialModalProps) {
  const [open, setOpen] = useState(true)
  const [step, setStep] = useState<Step>('welcome')

  const handleDismiss = useCallback(() => setOpen(false), [])
  const handleShowVideo = useCallback(() => setStep('video'), [])

  if (!open) return null

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

        {step === 'welcome' ? (
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
            <h2 className="text-lg font-semibold text-foreground">
              Drop a pin on what needs work.
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Click the image or select caption text to leave a precise comment.
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
            <button
              type="button"
              data-testid="review-tutorial-modal-got-it-video"
              onClick={handleDismiss}
              className="mt-6 w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Got it
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
