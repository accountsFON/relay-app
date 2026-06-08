'use client'

import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNotifications } from '@/components/notifications/notification-provider'

export function HeaderBell({ mountId = 'default' }: { mountId?: string } = {}) {
  const { count, isOpen, toggleDropdown, error } = useNotifications()
  const display = count >= 10 ? '9+' : count > 0 ? String(count) : null

  return (
    <button
      type="button"
      onClick={toggleDropdown}
      aria-label={`Notifications, ${count} unread`}
      aria-expanded={isOpen}
      aria-controls={`notification-dropdown-${mountId}`}
      className={cn(
        'relative inline-flex items-center justify-center rounded-md p-1.5',
        'text-foreground hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-ring',
      )}
    >
      <Bell className="size-5" aria-hidden="true" />
      {display !== null && (
        <span
          data-testid="bell-badge"
          className={cn(
            'absolute -right-0.5 -top-0.5 min-w-[16px] h-[16px] rounded-full',
            'bg-sky-600 text-white',
            'text-[10px] leading-none font-medium',
            'inline-flex items-center justify-center px-1',
          )}
        >
          {display}
        </span>
      )}
      {display === null && error === 'offline' && (
        <span
          data-testid="bell-offline-dot"
          className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-amber-500"
          aria-hidden="true"
        />
      )}
    </button>
  )
}
