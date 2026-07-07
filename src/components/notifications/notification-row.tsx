'use client'

import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNotifications } from '@/components/notifications/notification-provider'
import type { NotificationItemDTO } from '@/app/api/notifications/summary/route'
import { formatRelative } from '@/lib/format-relative'

export function NotificationRow({ item }: { item: NotificationItemDTO }) {
  const router = useRouter()
  const { markRead, clear, closeDropdown } = useNotifications()

  const handleClick = () => {
    void markRead(item.eventId)
    // item.href already carries the anchor fragment (#post-... / #comment-...)
    // from resolveHref; navigate to it verbatim.
    router.push(item.href)
    closeDropdown()
  }

  const handleDismiss = () => {
    void clear(item.eventId)
  }

  // Row is a flex container (not a single button) so the dismiss control can be
  // a sibling button -- nesting a button inside a button is invalid.
  return (
    <div className="group flex w-full items-start gap-1 pr-1 hover:bg-neutral-100/40">
      <button
        type="button"
        onClick={handleClick}
        onMouseEnter={() => router.prefetch(item.href)}
        className={cn(
          'flex min-w-0 flex-1 items-start gap-3 px-3 py-2.5 text-left',
          'focus:bg-neutral-100/40 focus:outline-none',
        )}
      >
        <span
          data-testid="unread-dot"
          className="mt-1.5 size-2 shrink-0 rounded-full bg-foreground"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-foreground">{item.summary}</p>
          <p className="text-[11px] text-muted-foreground">{formatRelative(item.createdAt)}</p>
        </div>
      </button>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={handleDismiss}
        className={cn(
          'mt-2 shrink-0 rounded-full p-1.5 text-neutral-400 transition-colors',
          'hover:bg-neutral-200 hover:text-foreground focus:outline-none',
          'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100',
        )}
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

