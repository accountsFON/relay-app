'use client'

import {
  CheckCircle2,
  MessageSquare,
  AlertCircle,
  Circle,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * `pending` is the rail's display alias for the `not_reviewed` ReviewDecision:
 * callers map `not_reviewed -> pending` so the rail reads as a review-progress
 * state ("not done yet") rather than the data-layer enum.
 */
export type InternalRailVerdict = 'approved' | 'changes_requested' | 'caption_edited' | 'pending'

export type InternalRailRow = {
  postId: string
  postNumber: number
  thumbnailUrl: string | null
  verdict: InternalRailVerdict
  /** Count of pins/comment threads on the post (open + resolved). */
  pinCount: number
}

export type InternalReviewRailProps = {
  rows: ReadonlyArray<InternalRailRow>
  selectedPostId: string | null
  onSelectPost: (postId: string) => void
}

const VERDICT_META: Record<
  InternalRailVerdict,
  { label: string; className: string; Icon: LucideIcon }
> = {
  approved: { label: 'Approved', className: 'text-emerald-700', Icon: CheckCircle2 },
  changes_requested: { label: 'Changes', className: 'text-amber-700', Icon: AlertCircle },
  caption_edited: { label: 'Edited', className: 'text-sky-700', Icon: MessageSquare },
  pending: { label: 'Pending', className: 'text-neutral-500', Icon: Circle },
}

export function InternalReviewRail({
  rows,
  selectedPostId,
  onSelectPost,
}: InternalReviewRailProps) {
  return (
    <nav aria-label="Posts" className="flex flex-col gap-1">
      {rows.map((row) => {
        const meta = VERDICT_META[row.verdict]
        const selected = row.postId === selectedPostId
        return (
          <button
            key={row.postId}
            type="button"
            data-testid="internal-rail-row"
            aria-current={selected || undefined}
            onClick={() => onSelectPost(row.postId)}
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-2 text-left ring-1 transition-colors',
              selected ? 'bg-neutral-50 ring-neutral-300' : 'ring-transparent hover:bg-neutral-50',
            )}
          >
            <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100 text-xs font-medium text-neutral-600">
              {row.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={row.thumbnailUrl} alt="" className="size-full object-cover" />
              ) : (
                row.postNumber
              )}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium text-neutral-900">Post {row.postNumber}</span>
              {row.pinCount > 0 ? (
                <span className="text-xs text-neutral-500">
                  {row.pinCount} {row.pinCount === 1 ? 'pin' : 'pins'}
                </span>
              ) : null}
            </span>
            <span className={cn('ml-auto flex items-center gap-1 text-xs font-medium', meta.className)}>
              <meta.Icon aria-hidden className="size-3.5" />
              {meta.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
