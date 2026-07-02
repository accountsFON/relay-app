'use client'

import { useState } from 'react'
import { CheckCircle2, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ResolveCheckbox } from '@/components/review/resolve-checkbox'
import { ChangesNavigator, type NavItem } from '@/components/review/changes-navigator'

export type InternalRailThread = {
  id: string
  label: string
  status: 'open' | 'resolved'
}

export type InternalRailRow = {
  postId: string
  postNumber: number
  thumbnailUrl: string | null
  pinStatus: 'open' | 'resolved' | 'none'
  openCount: number
  threads: InternalRailThread[]
}

export type InternalReviewRailProps = {
  rows: ReadonlyArray<InternalRailRow>
  selectedPostId: string | null
  onSelectPost: (postId: string) => void
  onResolveThread: (threadId: string) => Promise<void>
  onUnresolveThread: (threadId: string) => Promise<void>
  onScrollToPost: (postId: string) => void
}

export function InternalReviewRail({
  rows,
  selectedPostId,
  onSelectPost,
  onResolveThread,
  onUnresolveThread,
  onScrollToPost,
}: InternalReviewRailProps) {
  const [filterOn, setFilterOn] = useState(false)

  const visibleRows = filterOn ? rows.filter((r) => r.pinStatus === 'open') : rows

  const navItems: NavItem[] = visibleRows.flatMap((r) =>
    r.threads.map((t) => ({ id: t.id, anchorKey: r.postId, resolved: t.status === 'resolved' })),
  )

  return (
    <nav aria-label="Posts" className="flex flex-col gap-2">
      <ChangesNavigator
        items={navItems}
        filterOn={filterOn}
        onToggleFilter={() => setFilterOn((prev) => !prev)}
        onNavigate={onScrollToPost}
      />

      <div className="flex flex-col gap-1">
        {visibleRows.map((row) => {
          const selected = row.postId === selectedPostId
          return (
            <div key={row.postId} className="flex flex-col gap-1">
              <button
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

              {row.threads.length > 0 && (
                <div className="flex flex-col gap-1.5 pl-12 pr-3 pb-1">
                  {row.threads.map((t) => (
                    <ResolveCheckbox
                      key={t.id}
                      label={t.label}
                      resolved={t.status === 'resolved'}
                      onResolve={() => onResolveThread(t.id)}
                      onUnresolve={() => onUnresolveThread(t.id)}
                      disabled={false}
                      testId={`internal-rail-resolve-${t.id}`}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </nav>
  )
}
