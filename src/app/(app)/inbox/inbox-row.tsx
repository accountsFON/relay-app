'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { MentionInboxRow } from '@/components/activity/types'
import { markMentionReadAction } from '@/app/(app)/clients/[id]/activity/actions'
import { renderSummary, resolveHref } from '@/lib/notification-copy'
import { formatRelative } from '@/lib/format-relative'
import { getStepColor, type StepCategoryColor } from '@/lib/relay-step-colors'
import type { RelayStep } from '@prisma/client'

// Category dot color → Tailwind class. Mirrors the brand step palette so
// the inbox reads as the same surface as the kanban + step indicator.
const DOT_CLASS: Record<StepCategoryColor, string> = {
  blue: 'bg-blue-500',
  yellow: 'bg-yellow-500',
  coral: 'bg-coral-500',
  ink: 'bg-neutral-900',
}

/**
 * Pull the most informative step out of an event payload so the dot color
 * tracks the kanban color. Prefers the destination step on transitions
 * (passes, sends back, advances). Falls back to whatever step is present,
 * then to a neutral default for non-step events (comments, reviews).
 */
function inferStep(payload: Record<string, unknown>): RelayStep | null {
  const candidates: Array<unknown> = [payload.toStep, payload.step, payload.toSubState, payload.fromStep]
  for (const c of candidates) {
    if (typeof c === 'string') return c as RelayStep
  }
  return null
}

export function InboxRow({ row }: { row: MentionInboxRow }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const unread = !row.readAt

  const summary = renderSummary(row)
  const href = resolveHref(row)
  const payload = row.event.payload as Record<string, unknown>
  const step = inferStep(payload)
  const dotColor: StepCategoryColor = step ? getStepColor(step) : 'blue'

  function handleClick() {
    if (!unread) return
    startTransition(async () => {
      try {
        await markMentionReadAction(row.mentionId)
        router.refresh()
      } catch {
        // best effort
      }
    })
  }

  return (
    <Link
      href={href}
      onClick={handleClick}
      className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-neutral-50"
    >
      <span
        className={cn(
          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
          DOT_CLASS[dotColor],
        )}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-[13px]',
            unread ? 'font-semibold text-neutral-900' : 'text-neutral-500',
          )}
        >
          {summary}
        </p>
        <p className="mt-0.5 text-[11px] text-neutral-500">
          {formatRelative(row.event.createdAt)}
          {isPending ? ' · marking read…' : ''}
        </p>
      </div>
      {unread && (
        <span className="mt-1.5 flex shrink-0 items-center">
          <span
            data-testid="inbox-unread-dot"
            className="size-2 rounded-full bg-coral-500"
            aria-hidden="true"
          />
          <span className="sr-only">Unread</span>
        </span>
      )}
    </Link>
  )
}
