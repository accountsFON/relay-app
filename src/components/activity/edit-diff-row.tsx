'use client'

import { Pencil } from 'lucide-react'
import { ExpandableEventRow } from './expandable-event-row'
import { humanizeFieldName } from './field-labels'
import type { FieldChange } from '@/lib/field-changes'

export interface EditDiffRowProps {
  actorName: string
  subject: 'profile' | 'post'
  changes: FieldChange[]
  createdAtLabel: string
  className?: string
}

export function EditDiffRow({ actorName, subject, changes, createdAtLabel, className }: EditDiffRowProps) {
  const labels = changes.map((c) => humanizeFieldName(c.field))
  const shown = labels.slice(0, 3).join(', ')
  const extra = labels.length > 3 ? ` +${labels.length - 3} more` : ''
  const header = (
    <>
      <span className="font-medium">{actorName}</span>{' '}edited {subject}: {shown}{extra}
    </>
  )
  return (
    <ExpandableEventRow
      eventKind={subject === 'post' ? 'post_edited' : 'client_profile_edited'}
      icon={<Pencil className="size-3.5 shrink-0" />}
      header={header}
      createdAtLabel={createdAtLabel}
      className={className}
    >
      <ul className="grid gap-1.5">
        {changes.map((c) => (
          <li key={c.field}>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {humanizeFieldName(c.field)}
            </p>
            <p className="break-words [overflow-wrap:anywhere]">
              <span className="text-muted-foreground line-through">{c.from}</span>
              <span className="mx-1 text-muted-foreground">→</span>
              <span className="text-foreground">{c.to}</span>
            </p>
          </li>
        ))}
      </ul>
    </ExpandableEventRow>
  )
}
