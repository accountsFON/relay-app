'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useNotifications } from '@/components/notifications/notification-provider'
import { NotificationRow } from '@/components/notifications/notification-row'
import { FailedRunRow } from '@/components/notifications/failed-run-row'
import type { NotificationItemDTO } from '@/app/api/notifications/summary/route'

export function NotificationDropdown() {
  const { isOpen, items, count, error } = useNotifications()
  if (!isOpen) return null

  return (
    <div
      id="notification-dropdown"
      role="dialog"
      aria-label="Notifications"
      className={cn(
        'absolute right-0 top-full mt-2 w-[360px] max-w-[calc(100vw-1rem)]',
        'rounded-md border border-border bg-background shadow-lg',
        'overflow-hidden',
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="text-[13px] font-semibold text-foreground">Notifications</p>
        <p className="text-[11px] text-muted-foreground">
          {count === 0 ? 'all read' : `${count} unread`}
        </p>
      </div>

      <div className="max-h-[480px] overflow-y-auto">
        {items.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[13px] text-muted-foreground">
              You&apos;re all caught up. New activity will show up here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.mentionId}>{renderRow(item)}</li>
            ))}
          </ul>
        )}
      </div>

      {error === 'offline' && (
        <p className="border-t border-border px-3 py-1.5 text-[11px] text-amber-700 bg-amber-50">
          Connection lost, will retry…
        </p>
      )}

      <div className="border-t border-border px-3 py-2 text-center">
        <Link
          href="/inbox"
          className="text-[12px] text-foreground hover:underline"
        >
          See all in inbox →
        </Link>
      </div>
    </div>
  )
}

function renderRow(item: NotificationItemDTO) {
  if (item.kind === 'run_failed') return <FailedRunRow item={item} />
  return <NotificationRow item={item} />
}
