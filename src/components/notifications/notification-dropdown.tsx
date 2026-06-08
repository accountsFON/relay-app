'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useNotifications } from '@/components/notifications/notification-provider'
import { NotificationRow } from '@/components/notifications/notification-row'
import { FailedRunRow } from '@/components/notifications/failed-run-row'
import type { NotificationItemDTO } from '@/app/api/notifications/summary/route'

export function NotificationDropdown({
  mountId = 'default',
}: { mountId?: string } = {}) {
  const { isOpen, items, count, error, closeDropdown } = useNotifications()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      panelRef.current?.focus()
    }
  }, [isOpen])

  // Dismiss on a click anywhere outside the panel, or on Escape. The bell +
  // dropdown are mounted twice (mobile + desktop) sharing one isOpen, so match
  // ANY notification panel / bell trigger by stable selector rather than this
  // mount's own ref: clicking a bell is ignored (its toggle owns open/close),
  // clicking inside any panel is ignored, everything else closes.
  useEffect(() => {
    if (!isOpen) return
    function onPointerDown(e: PointerEvent) {
      const el = e.target instanceof Element ? e.target : null
      if (!el) return
      if (el.closest('[data-testid="notification-dropdown"]')) return
      if (el.closest('[aria-controls^="notification-dropdown-"]')) return
      closeDropdown()
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeDropdown()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen, closeDropdown])

  if (!isOpen) return null

  return (
    <div
      ref={panelRef}
      id={`notification-dropdown-${mountId}`}
      data-testid="notification-dropdown"
      role="dialog"
      aria-label="Notifications"
      tabIndex={-1}
      className={cn(
        'absolute right-0 top-full mt-2 w-[360px] max-w-[calc(100vw-1rem)]',
        'rounded-xl border border-border bg-card shadow-lg z-50',
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
          onClick={closeDropdown}
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
