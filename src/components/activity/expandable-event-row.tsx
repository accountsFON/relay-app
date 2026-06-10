'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ExpandableEventRowProps {
  /** lucide icon element, e.g. <Pencil className="size-3.5 shrink-0" /> */
  icon: ReactNode
  /** header line content (actor + message) */
  header: ReactNode
  createdAtLabel: string
  /** expanded body, revealed on click */
  children: ReactNode
  eventKind: string
  className?: string
}

export function ExpandableEventRow({
  icon,
  header,
  createdAtLabel,
  children,
  eventKind,
  className,
}: ExpandableEventRowProps) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className={cn(
        'rounded-md px-3 py-1.5 text-[12px] text-muted-foreground',
        className,
      )}
      data-event-kind={eventKind}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 text-left hover:text-foreground"
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{header}</span>
        {open ? (
          <ChevronDown className="size-3.5 shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" />
        )}
        <span className="shrink-0 text-[11px]">{createdAtLabel}</span>
      </button>
      {open && <div className="mt-2 pl-6 text-[12px]">{children}</div>}
    </div>
  )
}

/** Before / After caption blocks, reused by caption-fix + review-caption-accepted. */
export function CaptionDiffBody({
  oldCaption,
  newCaption,
}: {
  oldCaption: string
  newCaption: string
}) {
  return (
    <div className="grid gap-2">
      <div>
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Before
        </p>
        <p className="whitespace-pre-wrap rounded bg-muted/40 px-2 py-1 text-foreground">
          {oldCaption}
        </p>
      </div>
      <div>
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          After
        </p>
        <p className="whitespace-pre-wrap rounded bg-neutral-100 px-2 py-1 text-foreground">
          {newCaption}
        </p>
      </div>
    </div>
  )
}
