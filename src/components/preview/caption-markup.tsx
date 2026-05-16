'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { cn } from '@/lib/utils'

/**
 * Renders a caption string with existing caption-text pins as highlighted
 * ranges. Listens for native browser text selection inside the caption and
 * floats a "Comment" button next to the selection. Clicking the button
 * extracts char offsets relative to the caption text and forwards them via
 * `onCreatePin`.
 *
 * Pin ranges store `from`/`to` as char offsets into the caption (design doc
 * § Pin shapes). Resolved pins render greyed out.
 *
 * Layer 2 / Task 2.3.
 */
export type CaptionPin = {
  id: string
  from: number
  to: number
  status: 'open' | 'resolved'
}

export type CaptionMarkupProps = {
  caption: string
  existingPins: ReadonlyArray<CaptionPin>
  onPinClick: (id: string) => void
  onCreatePin: (from: number, to: number) => void
  className?: string
}

type SelectionState = {
  from: number
  to: number
  rect: DOMRect
}

export function CaptionMarkup({
  caption,
  existingPins,
  onPinClick,
  onCreatePin,
  className,
}: CaptionMarkupProps) {
  const captionRef = useRef<HTMLSpanElement | null>(null)
  const [selection, setSelection] = useState<SelectionState | null>(null)

  const segments = useMemo(
    () => buildSegments(caption, existingPins),
    [caption, existingPins],
  )

  const refresh = useCallback(() => {
    const container = captionRef.current
    if (!container) {
      setSelection(null)
      return
    }
    const win = container.ownerDocument?.defaultView
    if (!win) {
      setSelection(null)
      return
    }
    const sel = win.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setSelection(null)
      return
    }
    const range = sel.getRangeAt(0)
    if (!container.contains(range.commonAncestorContainer)) {
      setSelection(null)
      return
    }
    const offsets = computeOffsets(container, range)
    if (!offsets) {
      setSelection(null)
      return
    }
    const { from, to } = offsets
    if (from === to) {
      setSelection(null)
      return
    }
    const rect = range.getBoundingClientRect()
    setSelection({ from, to, rect })
  }, [])

  useEffect(() => {
    const container = captionRef.current
    if (!container) return
    const doc = container.ownerDocument
    if (!doc) return

    function handle() {
      refresh()
    }

    doc.addEventListener('selectionchange', handle)
    return () => {
      doc.removeEventListener('selectionchange', handle)
    }
  }, [refresh])

  // Re-run on resize/scroll so the floating button tracks the selection rect.
  useLayoutEffect(() => {
    if (!selection) return
    function handle() {
      refresh()
    }
    window.addEventListener('resize', handle)
    window.addEventListener('scroll', handle, true)
    return () => {
      window.removeEventListener('resize', handle)
      window.removeEventListener('scroll', handle, true)
    }
  }, [selection, refresh])

  function handleCreate() {
    if (!selection) return
    const { from, to } = selection
    onCreatePin(from, to)
    // Collapse so the button disappears.
    captionRef.current?.ownerDocument?.defaultView?.getSelection()?.removeAllRanges()
    setSelection(null)
  }

  return (
    <span
      className={cn('relative inline', className)}
      data-testid="caption-markup"
    >
      <span ref={captionRef} data-testid="caption-markup-text">
        {segments.map((segment, idx) => {
          if (segment.kind === 'text') {
            return <span key={idx}>{segment.text}</span>
          }
          const pin = segment.pin
          const isResolved = pin.status === 'resolved'
          return (
            <button
              key={pin.id}
              type="button"
              data-testid="caption-markup-pin"
              data-thread-id={pin.id}
              data-status={pin.status}
              onClick={(event) => {
                event.stopPropagation()
                onPinClick(pin.id)
              }}
              className={cn(
                'cursor-pointer rounded-sm px-0.5 text-inherit underline-offset-2',
                isResolved
                  ? 'bg-[#efefef] text-[#8e8e8e] line-through opacity-80 hover:bg-[#e5e5e5]'
                  : 'bg-amber-100 text-amber-900 hover:bg-amber-200',
              )}
            >
              {segment.text}
            </button>
          )
        })}
      </span>

      {selection ? (
        <FloatingCommentButton
          rect={selection.rect}
          onClick={handleCreate}
        />
      ) : null}
    </span>
  )
}

type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'pin'; text: string; pin: CaptionPin }

function buildSegments(
  caption: string,
  pins: ReadonlyArray<CaptionPin>,
): Segment[] {
  if (pins.length === 0) {
    return [{ kind: 'text', text: caption }]
  }

  // Sort by start, drop invalid ranges (out of bounds or zero-width).
  const valid = pins
    .filter(
      (p) =>
        Number.isFinite(p.from) &&
        Number.isFinite(p.to) &&
        p.from >= 0 &&
        p.to <= caption.length &&
        p.from < p.to,
    )
    .slice()
    .sort((a, b) => a.from - b.from)

  const out: Segment[] = []
  let cursor = 0
  for (const pin of valid) {
    // Skip overlaps , the first pin in an overlapping pair wins.
    if (pin.from < cursor) continue
    if (pin.from > cursor) {
      out.push({ kind: 'text', text: caption.slice(cursor, pin.from) })
    }
    out.push({
      kind: 'pin',
      text: caption.slice(pin.from, pin.to),
      pin,
    })
    cursor = pin.to
  }
  if (cursor < caption.length) {
    out.push({ kind: 'text', text: caption.slice(cursor) })
  }
  return out
}

/**
 * Walks the container's text nodes in document order to convert a DOM Range
 * into character offsets within the caption string. Pin button text counts
 * toward the offset (each pin button renders the original substring), so
 * pre-pin text + pin text + post-pin text equals the caption.
 */
function computeOffsets(
  container: HTMLElement,
  range: Range,
): { from: number; to: number } | null {
  let from = -1
  let to = -1
  let pos = 0

  const doc = container.ownerDocument
  if (!doc) return null

  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode() as Text | null
  while (node) {
    const len = node.data.length

    if (node === range.startContainer) {
      from = pos + range.startOffset
    }
    if (node === range.endContainer) {
      to = pos + range.endOffset
    }

    pos += len
    node = walker.nextNode() as Text | null
  }

  if (from < 0 || to < 0) return null
  if (from > to) [from, to] = [to, from]
  return { from, to }
}

function FloatingCommentButton({
  rect,
  onClick,
}: {
  rect: DOMRect
  onClick: () => void
}) {
  // Position above the selection. Clamp to viewport horizontally.
  const top = Math.max(8, rect.top - 36)
  const left = clamp(
    rect.left + rect.width / 2,
    50,
    Math.max(50, (typeof window !== 'undefined' ? window.innerWidth : 1024) - 50),
  )

  return (
    <button
      type="button"
      data-testid="caption-markup-comment-button"
      onMouseDown={(event) => {
        // Prevent the document selectionchange from collapsing before we read.
        event.preventDefault()
      }}
      onClick={onClick}
      style={{
        position: 'fixed',
        top,
        left,
        transform: 'translateX(-50%)',
        zIndex: 50,
      }}
      className="rounded-full bg-[#262626] px-3 py-1 text-[12px] font-medium text-white shadow-lg hover:bg-black"
    >
      Comment
    </button>
  )
}

function clamp(n: number, min: number, max: number): number {
  if (n < min) return min
  if (n > max) return max
  return n
}
