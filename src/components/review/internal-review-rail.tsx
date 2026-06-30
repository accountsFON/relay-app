'use client'

import { CheckCircle2, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

export type InternalRailRow = {
  postId: string
  postNumber: number
  thumbnailUrl: string | null
  pinStatus: 'open' | 'resolved' | 'none'
  openCount: number
}

export type InternalReviewRailProps = {
  rows: ReadonlyArray<InternalRailRow>
  selectedPostId: string | null
  onSelectPost: (postId: string) => void
}

export function InternalReviewRail({
  rows,
  selectedPostId,
  onSelectPost,
}: InternalReviewRailProps) {
  return (
    <nav aria-label="Posts" className="flex flex-col gap-1">
      {rows.map((row) => {
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
            </span>
            {row.pinStatus === 'open' && (
              <span className="ml-auto flex items-center gap-1 text-xs font-medium text-amber-700">
                <MessageSquare aria-hidden className="size-3.5" />
                {row.openCount} open
              </span>
            )}
            {row.pinStatus === 'resolved' && (
              <span className="ml-auto flex items-center gap-1 text-xs font-medium text-neutral-500">
                <CheckCircle2 aria-hidden className="size-3.5" />
                Resolved
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
