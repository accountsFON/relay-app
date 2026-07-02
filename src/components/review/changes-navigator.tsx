'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface NavItem {
  id: string
  /** Key the host scrolls to when this item is stepped to (postId or threadId). */
  anchorKey: string
  resolved: boolean
}

export interface ChangesNavigatorProps {
  items: ReadonlyArray<NavItem>
  filterOn: boolean
  onToggleFilter: () => void
  onNavigate: (anchorKey: string) => void
}

/**
 * Presentational changes navigator: a "Changes only" filter toggle + an
 * item-level Prev/Next stepper that walks UNRESOLVED items in order (stop at
 * ends) + a resolved counter. Side-effect-free beyond the injected callbacks.
 */
export function ChangesNavigator({
  items,
  filterOn,
  onToggleFilter,
  onNavigate,
}: ChangesNavigatorProps) {
  const [cursor, setCursor] = useState(-1)
  const resolvedCount = items.filter((i) => i.resolved).length
  const unresolvedIdx = items
    .map((i, idx) => (i.resolved ? -1 : idx))
    .filter((idx) => idx >= 0)

  const hasNext = unresolvedIdx.some((idx) => idx > cursor)
  const hasPrev = cursor > 0 && unresolvedIdx.some((idx) => idx < cursor)

  function step(dir: 1 | -1) {
    const candidates =
      dir === 1
        ? unresolvedIdx.filter((idx) => idx > cursor)
        : unresolvedIdx.filter((idx) => idx < cursor)
    const target = dir === 1 ? candidates[0] : candidates[candidates.length - 1]
    if (target === undefined) return
    setCursor(target)
    onNavigate(items[target].anchorKey)
  }

  return (
    <div
      data-testid="changes-navigator"
      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-2 py-1.5"
    >
      <button
        type="button"
        data-testid="changes-navigator-filter"
        onClick={onToggleFilter}
        aria-pressed={filterOn}
        className={cn(
          'rounded-full px-2 py-0.5 text-[11px] font-medium',
          filterOn ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground',
        )}
      >
        Changes only
      </button>
      <span data-testid="changes-navigator-counter" className="text-[11px] tabular-nums text-muted-foreground">
        {resolvedCount} of {items.length} resolved
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          data-testid="changes-navigator-prev"
          onClick={() => step(-1)}
          disabled={!hasPrev}
          aria-label="Previous unresolved item"
          className="rounded p-1 text-muted-foreground disabled:opacity-40"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          data-testid="changes-navigator-next"
          onClick={() => step(1)}
          disabled={!hasNext}
          aria-label="Next unresolved item"
          className="rounded p-1 text-muted-foreground disabled:opacity-40"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  )
}
