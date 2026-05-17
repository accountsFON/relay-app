/**
 * CaptionDiffView , inline diff renderer for AM-side review session display.
 *
 * Renders a sequence of DiffSegments produced by `diffText` as colored inline
 * spans, plus visible `<br>` elements for any newlines (otherwise paragraph
 * restructure edits look invisible).
 *
 * Color contrast was chosen to meet WCAG AA on the corresponding background:
 *   - inserts:  green-50 / green-900 + underline
 *   - deletes:  red-50   / red-900   + line-through
 *   - equal:    inherits parent text color
 *
 * Spec: design doc § Caption editing UX § AM-side acceptance; plan Task 1.6.
 */

import { Fragment } from 'react'
import { cn } from '@/lib/utils'
import type { DiffSegment } from '@/lib/text-diff'

export type CaptionDiffViewProps = {
  segments: DiffSegment[]
  className?: string
}

export function CaptionDiffView({ segments, className }: CaptionDiffViewProps) {
  return (
    <div
      data-testid="caption-diff-view"
      className={cn(
        'whitespace-pre-wrap break-words font-sans text-[14px] leading-relaxed text-foreground',
        className,
      )}
    >
      {segments.map((segment, idx) => (
        <DiffSegmentSpan key={idx} segment={segment} index={idx} />
      ))}
    </div>
  )
}

function DiffSegmentSpan({
  segment,
  index,
}: {
  segment: DiffSegment
  index: number
}) {
  const className =
    segment.type === 'insert'
      ? 'bg-green-50 text-green-900 underline decoration-green-500 decoration-2'
      : segment.type === 'delete'
        ? 'bg-red-50 text-red-900 line-through'
        : ''

  // Split on newlines so we can render explicit <br> elements. Without this,
  // paragraph-restructure edits (where the only change is whitespace) would be
  // invisible in the JSX output.
  const parts = segment.text.split('\n')

  return (
    <span
      data-testid={`caption-diff-segment-${segment.type}`}
      data-segment-type={segment.type}
      data-segment-index={index}
      className={className}
    >
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part}
          {i < parts.length - 1 ? (
            <br data-testid={`caption-diff-newline-${segment.type}`} />
          ) : null}
        </Fragment>
      ))}
    </span>
  )
}
