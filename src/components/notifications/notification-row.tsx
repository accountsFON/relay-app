'use client'

import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useNotifications } from '@/components/notifications/notification-provider'
import type { NotificationItemDTO } from '@/app/api/notifications/summary/route'

export function NotificationRow({ item }: { item: NotificationItemDTO }) {
  const router = useRouter()
  const { markRead, closeDropdown } = useNotifications()

  const handleClick = () => {
    void markRead(item.eventId)
    router.push(`${item.href}#comment-${item.eventId}`)
    closeDropdown()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={() => router.prefetch(item.href)}
      className={cn(
        'flex w-full items-start gap-3 px-3 py-2.5 text-left',
        'hover:bg-cream-warm/40 focus:bg-cream-warm/40 focus:outline-none',
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

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString()
}
