'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { MentionInboxRow } from '@/components/activity/types'
import { markMentionReadAction } from '@/app/(app)/clients/[id]/activity/actions'

export function InboxRow({ row }: { row: MentionInboxRow }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const unread = !row.readAt

  const summary = renderSummary(row)
  const href = `/clients/${row.client.id}`

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

function renderSummary(row: MentionInboxRow): string {
  const actor = row.event.actor?.name ?? 'Someone'
  const payload = row.event.payload
  switch (payload.kind) {
    case 'comment': {
      const body = (payload as { body?: string }).body ?? ''
      const trimmed = body.length > 120 ? body.slice(0, 117) + '…' : body
      return `${actor}: ${trimmed}`
    }
    case 'batch_passed':
      return `${actor} passed a batch to you.`
    case 'batch_sent_back':
      return `${actor} sent a batch back to you.`
    case 'batch_revision_dispatched':
      return `${actor} dispatched a revision for you.`
    case 'batch_revision_completed':
      return `Revision completed.`
    case 'batch_step_advanced':
      return `${actor} advanced the batch.`
    default:
      return `${actor} mentioned you.`
  }
}

function formatRelative(date: Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(date).toLocaleDateString()
}
