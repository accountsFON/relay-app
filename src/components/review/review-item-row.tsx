'use client'

/**
 * ReviewItemRow — one row on the AM-side review session detail page.
 *
 * Renders a single non-approved ReviewItem. Branches on decision:
 *   - changes_requested: shows the client comment in a blockquote + a
 *     "Mark Addressed" button.
 *   - caption_edited: shows the optional comment, then inline diff via
 *     <CaptionDiffView>, then Accept / Reject / Edit Further actions.
 *
 * The `mode` prop distinguishes "pending" rows (awaiting AM action) from
 * "addressed" rows (already handled, rendered as collapsed acknowledgment).
 *
 * Action handlers are passed in by the parent; Layer 3 task 3.4 will wire
 * the actual server actions. For Layer 2 we accept any async `() => Promise`
 * so the parent can stub with a console.log.
 *
 * Spec: design doc § AM-side acceptance + § Caption editing UX + plan Task 2.2.
 */

import { useState, useTransition } from 'react'
import { CaptionDiffView } from '@/components/preview/caption-diff-view'
import { diffText } from '@/lib/text-diff'
import { Button } from '@/components/ui/button'
import type { ReviewItemHydrated } from '@/types/review-session'

export type ReviewItemRowMode = 'pending' | 'addressed'

export interface HydratedItemWithPost extends ReviewItemHydrated {
  post: {
    id: string
    postDate: Date
    caption: string
    mediaUrls: string[]
  }
}

export interface ReviewItemRowProps {
  item: HydratedItemWithPost
  /** 1-indexed position within the batch (matches the AM preview ordering). */
  postNumber: number
  mode: ReviewItemRowMode
  /** caption_edited only: AM accepts the suggested caption. */
  onAccept?: () => Promise<void>
  /** caption_edited only: AM rejects the suggested caption. */
  onReject?: () => Promise<void>
  /** changes_requested only: AM marks the comment addressed. */
  onAddressed?: () => Promise<void>
}

function formatPostDate(date: Date): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(date)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

export function ReviewItemRow({
  item,
  postNumber,
  mode,
  onAccept,
  onReject,
  onAddressed,
}: ReviewItemRowProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const headerLabel = `Post #${postNumber} · ${formatPostDate(item.post.postDate)}`

  function run(handler?: () => Promise<void>) {
    if (!handler) return
    setError(null)
    startTransition(async () => {
      try {
        await handler()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed')
      }
    })
  }

  const isAddressed = mode === 'addressed'

  return (
    <div
      data-testid={`review-item-row-${item.id}`}
      data-mode={mode}
      data-decision={item.decision}
      className={`rounded-2xl border border-border bg-card p-5 ${
        isAddressed ? 'opacity-70' : ''
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{headerLabel}</h3>
          <DecisionBadge decision={item.decision} />
          {isAddressed && (
            <span
              data-testid="addressed-tag"
              className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground"
            >
              Addressed
            </span>
          )}
        </div>
      </div>

      {item.decision === 'changes_requested' && (
        <ChangesRequestedBody
          comment={item.comment}
          isAddressed={isAddressed}
          isPending={isPending}
          onAddressed={onAddressed ? () => run(onAddressed) : undefined}
        />
      )}

      {item.decision === 'caption_edited' && (
        <CaptionEditedBody
          comment={item.comment}
          originalCaption={item.post.caption}
          suggestedCaption={item.suggestedCaption ?? ''}
          isAddressed={isAddressed}
          isPending={isPending}
          onAccept={onAccept ? () => run(onAccept) : undefined}
          onReject={onReject ? () => run(onReject) : undefined}
        />
      )}

      {error && (
        <p
          role="alert"
          data-testid="review-item-row-error"
          className="mt-3 text-xs text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  )
}

function DecisionBadge({ decision }: { decision: ReviewItemHydrated['decision'] }) {
  if (decision === 'changes_requested') {
    return (
      <span
        data-testid="decision-badge-changes-requested"
        className="inline-flex items-center rounded-full bg-coral-100 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-coral-500"
      >
        Request changes
      </span>
    )
  }
  if (decision === 'caption_edited') {
    return (
      <span
        data-testid="decision-badge-caption-edited"
        className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-blue-900"
      >
        Caption edit suggested
      </span>
    )
  }
  return null
}

function ChangesRequestedBody({
  comment,
  isAddressed,
  isPending,
  onAddressed,
}: {
  comment: string | null
  isAddressed: boolean
  isPending: boolean
  onAddressed?: () => void
}) {
  return (
    <div className="space-y-3">
      <blockquote
        data-testid="changes-requested-comment"
        className="border-l-4 border-coral-300 bg-coral-100/40 px-4 py-2 text-sm text-foreground"
      >
        {comment ? comment : <em className="text-muted-foreground">No comment provided.</em>}
      </blockquote>
      {!isAddressed && onAddressed && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={onAddressed}
            disabled={isPending}
            data-testid="mark-addressed-button"
          >
            {isPending ? 'Saving…' : 'Mark Addressed'}
          </Button>
        </div>
      )}
    </div>
  )
}

function CaptionEditedBody({
  comment,
  originalCaption,
  suggestedCaption,
  isAddressed,
  isPending,
  onAccept,
  onReject,
}: {
  comment: string | null
  originalCaption: string
  suggestedCaption: string
  isAddressed: boolean
  isPending: boolean
  onAccept?: () => void
  onReject?: () => void
}) {
  const segments = diffText(originalCaption, suggestedCaption)
  return (
    <div className="space-y-3">
      {comment && (
        <blockquote
          data-testid="caption-edited-comment"
          className="border-l-4 border-blue-300 bg-blue-50/40 px-4 py-2 text-sm text-foreground"
        >
          {comment}
        </blockquote>
      )}
      <div
        data-testid="caption-edited-diff-wrapper"
        className="rounded-xl bg-neutral-100/40 p-4"
      >
        <CaptionDiffView segments={segments} />
      </div>
      {!isAddressed && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {onReject && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReject}
              disabled={isPending}
              data-testid="reject-edit-button"
            >
              Reject Edit
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled
            data-testid="edit-further-button"
            title="Available in v2.1"
          >
            Edit Further
          </Button>
          {onAccept && (
            <Button
              variant="default"
              size="sm"
              onClick={onAccept}
              disabled={isPending}
              data-testid="accept-edit-button"
            >
              {isPending ? 'Saving…' : 'Accept Edit'}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
