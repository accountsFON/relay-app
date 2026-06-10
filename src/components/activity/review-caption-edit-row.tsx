'use client'

/**
 * review_caption_edit_accepted row. Expandable before/after for an accepted
 * client caption edit, reusing the shared shell + caption diff body.
 */
import { Check } from 'lucide-react'
import { ExpandableEventRow, CaptionDiffBody } from './expandable-event-row'

export interface ReviewCaptionEditRowProps {
  actorName: string
  postRef: string
  oldCaption: string
  newCaption: string
  createdAtLabel: string
  className?: string
}

export function ReviewCaptionEditRow({
  actorName,
  postRef,
  oldCaption,
  newCaption,
  createdAtLabel,
  className,
}: ReviewCaptionEditRowProps) {
  return (
    <ExpandableEventRow
      eventKind="review_caption_edit_accepted"
      icon={<Check className="size-3.5 shrink-0" />}
      header={
        <>
          <span className="font-medium">{actorName}</span>
          {' '}accepted client caption edit on {postRef}
        </>
      }
      createdAtLabel={createdAtLabel}
      className={className}
    >
      <CaptionDiffBody oldCaption={oldCaption} newCaption={newCaption} />
    </ExpandableEventRow>
  )
}
