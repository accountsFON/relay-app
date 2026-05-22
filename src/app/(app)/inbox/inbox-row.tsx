'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { MentionInboxRow } from '@/components/activity/types'
import { markMentionReadAction } from '@/app/(app)/clients/[id]/activity/actions'
import { renderSummary, resolveHref } from '@/lib/notification-copy'
import { formatRelative } from '@/lib/format-relative'

export function InboxRow({ row }: { row: MentionInboxRow }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const unread = !row.readAt

  const summary = renderSummary(row)
  const href = resolveHref(row)

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
      className={cn(
        'flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-cream-80',
        unread && 'bg-cream-warm/40',
      )}
    >
      <span
        className={cn(
          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
          unread ? 'bg-foreground' : 'bg-transparent',
        )}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-foreground">{summary}</p>
        <p className="text-[11px] text-muted-foreground">
          {formatRelative(row.event.createdAt)}
          {isPending ? ' · marking read…' : ''}
        </p>
      </div>
    </Link>
  )
}

