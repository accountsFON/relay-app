'use client'

import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useNotifications } from '@/components/notifications/notification-provider'
import type { NotificationItemDTO } from '@/app/api/notifications/summary/route'
import { formatRelative } from '@/lib/format-relative'

export function NotificationRow({ item }: { item: NotificationItemDTO }) {
  const router = useRouter()
  const { markRead, closeDropdown } = useNotifications()

  const handleClick = () => {
    void markRead(item.eventId)
    // item.href already carries the anchor fragment (#post-... / #comment-...)
    // from resolveHref; navigate to it verbatim.
    router.push(item.href)
    closeDropdown()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={() => router.prefetch(item.href)}
      className={cn(
        'flex w-full items-start gap-3 px-3 py-2.5 text-left',
        'hover:bg-neutral-100/40 focus:bg-neutral-100/40 focus:outline-none',
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
  )
}

