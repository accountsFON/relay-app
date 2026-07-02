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
  mode?: 'resolve' | 'navigate'
  showFilter?: boolean
}

/**
 * Presentational changes navigator: a "Changes only" filter toggle + an
 * item-level Prev/Next stepper + a counter.
 *
 * resolve mode (default): walks UNRESOLVED items only; counter shows
 *   "{resolvedCount} of {total} resolved"; filter toggle visible.
 * navigate mode: walks ALL items in order; counter shows
 *   "{position} of {total}"; filter toggle hidden.
 *
 * Side-effect-free beyond the injected callbacks.
 */
export function ChangesNavigator({
  items,
  filterOn,
  onToggleFilter,
  onNavigate,
  mode = 'resolve',
  showFilter,
}: ChangesNavigatorProps) {
  const navigate = mode === 'navigate'
  const [cursor, setCursor] = useState(-1)
  // Reset the stepper when the item set changes (e.g. after a resolve + server
  // refresh) so the cursor never points at a stale/removed item. "Adjust state
  // during render when a prop changes" pattern; costs nothing on ordinary renders.
  const itemsSignature = items.map((i) => `${i.id}:${i.resolved ? 1 : 0}`).join('|')
  const [seededSignature, setSeededSignature] = useState(itemsSignature)
  if (itemsSignature !== seededSignature) {
    setCursor(-1)
    setSeededSignature(itemsSignature)
  }
  const resolvedCount = items.filter((i) => i.resolved).length
  const walkableIdx = navigate
    ? items.map((_, idx) => idx)
    : items.map((i, idx) => (i.resolved ? -1 : idx)).filter((idx) => idx >= 0)

  const hasNext = walkableIdx.some((idx) => idx > cursor)
  const hasPrev = cursor > 0 && walkableIdx.some((idx) => idx < cursor)

  function step(dir: 1 | -1) {
    const candidates =
      dir === 1
        ? walkableIdx.filter((idx) => idx > cursor)
        : walkableIdx.filter((idx) => idx < cursor)
    const target = dir === 1 ? candidates[0] : candidates[candidates.length - 1]
    if (target === undefined) return
    setCursor(target)
    onNavigate(items[target].anchorKey)
  }

  const counterText = navigate
    ? `${cursor < 0 ? 0 : cursor + 1} of ${items.length}`
    : `${resolvedCount} of ${items.length} resolved`

  const filterVisible = showFilter ?? !navigate

  return (
    <div
      data-testid="changes-navigator"
      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-2 py-1.5"
    >
      {filterVisible && (
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
      )}
      <span data-testid="changes-navigator-counter" className="text-[11px] tabular-nums text-muted-foreground">
        {counterText}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          data-testid="changes-navigator-prev"
          onClick={() => step(-1)}
          disabled={!hasPrev}
          aria-label={navigate ? 'Previous item' : 'Previous unresolved item'}
          className="rounded p-1 text-muted-foreground disabled:opacity-40"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          data-testid="changes-navigator-next"
          onClick={() => step(1)}
          disabled={!hasNext}
          aria-label={navigate ? 'Next item' : 'Next unresolved item'}
          className="rounded p-1 text-muted-foreground disabled:opacity-40"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  )
}
