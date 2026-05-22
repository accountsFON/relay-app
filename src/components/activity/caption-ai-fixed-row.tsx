'use client'

/**
 * Client-only collapsible body for post_caption_ai_fixed events. Lives in
 * its own file so the event-renderer can stay server-renderable; only the
 * disclosure state needs client interactivity.
 */
import { useState } from 'react'
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CaptionAiFixedRowProps {
  actorName: string
  postRef: string
  oldCaption: string
  newCaption: string
  createdAtLabel: string
  className?: string
}

export function CaptionAiFixedRow({
  actorName,
  postRef,
  oldCaption,
  newCaption,
  createdAtLabel,
  className,
}: CaptionAiFixedRowProps) {
  const [open, setOpen] = useState(false)

  return (
    <div
      className={cn(
        'rounded-md px-3 py-1.5 text-[12px] text-muted-foreground',
        className,
      )}
      data-event-kind="post_caption_ai_fixed"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 text-left hover:text-foreground"
      >
        <Sparkles className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium">{actorName}</span>
          {' '}fixed caption with AI on {postRef}
        </span>
        {open ? (
          <ChevronDown className="size-3.5 shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" />
        )}
        <span className="shrink-0 text-[11px]">{createdAtLabel}</span>
      </button>
      {open && (
        <div className="mt-2 grid gap-2 pl-6 text-[12px]">
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
      )}
    </div>
  )
}
