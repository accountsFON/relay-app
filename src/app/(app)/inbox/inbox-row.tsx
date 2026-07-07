'use client'

import Link from 'next/link'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MailOpen, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MentionInboxRow } from '@/components/activity/types'
import {
  markMentionReadAction,
  clearMentionAction,
} from '@/app/(app)/clients/[id]/activity/actions'
import { renderSummary, resolveHref } from '@/lib/notification-copy'
import { formatRelative } from '@/lib/format-relative'
import { getStepColor, type StepCategoryColor } from '@/lib/relay-step-colors'
import { shouldDismiss } from './inbox-swipe'
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
  const [, startTransition] = useTransition()
  const [cleared, setCleared] = useState(false)
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [exiting, setExiting] = useState(false)
  const touch = useRef<{ x: number; y: number; horizontal: boolean; swiped: boolean } | null>(null)
  const rowRef = useRef<HTMLAnchorElement | null>(null)

  const unread = !row.readAt
  const summary = renderSummary(row)
  const href = resolveHref(row)
  const payload = row.event.payload as Record<string, unknown>
  const step = inferStep(payload)
  const dotColor: StepCategoryColor = step ? getStepColor(step) : 'blue'

  function clear() {
    setCleared(true)
    startTransition(async () => {
      try {
        await clearMentionAction(row.mentionId)
        router.refresh()
      } catch {
        // best effort; a refresh would restore the row on failure
      }
    })
  }

  // Mark read without navigating (the envelope icon). Same effect as clicking
  // the row body, minus the Link navigation. No-op once already read.
  function markReadInPlace() {
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

  function handleClick(e: React.MouseEvent) {
    if (touch.current?.swiped) {
      e.preventDefault()
      return
    }
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

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    touch.current = { x: t.clientX, y: t.clientY, horizontal: false, swiped: false }
    setDragging(true)
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!touch.current) return
    const t = e.touches[0]
    const dx = t.clientX - touch.current.x
    const dy = t.clientY - touch.current.y
    if (!touch.current.horizontal) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        touch.current.horizontal = true
      } else {
        return // not (yet) a horizontal gesture; let the list scroll
      }
    }
    if (dx < 0) {
      // Vertical scroll is preserved by `touchAction: 'pan-y'` on the row;
      // React's touch listeners are passive so this preventDefault is a
      // belt-and-suspenders no-op on most browsers, kept for older engines.
      e.preventDefault()
      touch.current.swiped = true
      setDragX(dx)
    }
  }
  function onTouchEnd() {
    if (!touch.current) return
    setDragging(false)
    const width = rowRef.current?.offsetWidth ?? 0
    if (touch.current.horizontal && shouldDismiss(dragX, width)) {
      setExiting(true)
      setDragX(-width)
      // clear() fires on transition end (see onTransitionEnd)
    } else {
      touch.current.swiped = false
      setDragX(0)
    }
  }
  function onTransitionEnd(e: React.TransitionEvent) {
    if (exiting && e.propertyName === 'transform') clear()
  }

  if (cleared) return null

  return (
    <Link
      ref={rowRef}
      href={href}
      onClick={handleClick}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTransitionEnd={onTransitionEnd}
      style={{
        transform: `translateX(${dragX}px)`,
        transition: dragging
          ? 'none'
          : 'transform 200ms ease, opacity 200ms ease, background-color 150ms ease',
        opacity: exiting ? 0 : 1,
        touchAction: 'pan-y',
      }}
      className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-neutral-50"
    >
      <span
        className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', DOT_CLASS[dotColor])}
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
      <span className="-mr-1 -mt-1 flex shrink-0 items-center gap-0.5">
        {unread && (
          <button
            type="button"
            aria-label="Mark as read"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              markReadInPlace()
            }}
            className="rounded-full p-1.5 text-neutral-400 opacity-100 transition-colors hover:bg-neutral-200 hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
          >
            <MailOpen className="size-4" />
          </button>
        )}
        <button
          type="button"
          aria-label="Clear notification"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            clear()
          }}
          className="rounded-full p-1.5 text-neutral-400 opacity-100 transition-colors hover:bg-neutral-200 hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
        >
          <Trash2 className="size-4" />
        </button>
      </span>
    </Link>
  )
}
