'use client'

import { CheckCircle2, MessageSquare, AlertCircle, Circle } from 'lucide-react'

export type InternalRailVerdict = 'approved' | 'changes_requested' | 'caption_edited' | 'pending'

export type InternalRailRow = {
  postId: string
  postNumber: number
  thumbnailUrl: string | null
  verdict: InternalRailVerdict
  /** Count of pins/comment threads on the post (open + resolved). */
  pinCount: number
}

const VERDICT_META: Record<
  InternalRailVerdict,
  { label: string; className: string; Icon: typeof CheckCircle2 }
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
}: {
  rows: ReadonlyArray<InternalRailRow>
  selectedPostId: string | null
  onSelectPost: (postId: string) => void
}) {
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
            aria-current={selected ? 'true' : undefined}
            onClick={() => onSelectPost(row.postId)}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 text-left ring-1 transition ${
              selected ? 'bg-neutral-50 ring-neutral-300' : 'ring-transparent hover:bg-neutral-50'
            }`}
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
            <span className={`ml-auto flex items-center gap-1 text-xs font-medium ${meta.className}`}>
              <meta.Icon aria-hidden className="size-3.5" />
              {meta.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
