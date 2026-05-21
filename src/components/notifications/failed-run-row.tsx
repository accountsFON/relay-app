'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { FailedRunActions } from '@/components/relay/failed-run-actions'
import { useNotifications } from '@/components/notifications/notification-provider'
import type { NotificationItemDTO } from '@/app/api/notifications/summary/route'

export function FailedRunRow({ item }: { item: NotificationItemDTO }) {
  const { markRead } = useNotifications()
  const onActionComplete = () => {
    void markRead(item.eventId)
  }

  if (!item.runId) {
    // Defensive, run_failed events always carry a runId. Fall back to a passive row.
    return (
      <div className="flex items-start gap-3 px-3 py-2.5">
        <AlertTriangle className="mt-1 size-4 shrink-0 text-destructive" />
        <p className="text-[13px] text-foreground">{item.summary}</p>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3 px-3 py-2.5 hover:bg-cream-warm/40">
      <AlertTriangle className="mt-1 size-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <Link
          href={item.href}
          className="text-[13px] text-foreground hover:underline"
        >
          {item.summary}
        </Link>
        <FailedRunActions
          runId={item.runId}
          onRetried={onActionComplete}
          onDismissed={onActionComplete}
        />
      </div>
    </div>
  )
}
