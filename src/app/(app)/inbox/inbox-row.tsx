'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { MentionInboxRow } from '@/components/activity/types'
import { markMentionReadAction } from '@/app/(app)/clients/[id]/activity/actions'
import { relayStepLabel } from '@/lib/relay-step-labels'

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

function resolveHref(row: MentionInboxRow): string {
  // Batch events know their batchId in the payload; deep-link to the
  // batch detail page so the user lands exactly where the action is.
  const payload = row.event.payload as Record<string, unknown>
  const batchId = typeof payload.batchId === 'string' ? payload.batchId : null
  if (batchId) {
    return `/clients/${row.client.id}/batches/${batchId}`
  }
  // Run-level events deep-link to the run page when possible.
  if (row.event.runId) {
    return `/clients/${row.client.id}/runs/${row.event.runId}`
  }
  return `/clients/${row.client.id}`
}

function renderSummary(row: MentionInboxRow): string {
  const actor = row.event.actor?.name ?? 'Someone'
  const clientName = row.client.name
  const payload = row.event.payload
  const prefix = `${clientName} · `

  switch (payload.kind) {
    case 'comment': {
      const body = (payload as { body?: string }).body ?? ''
      const trimmed = body.length > 120 ? body.slice(0, 117) + '…' : body
      return `${prefix}${actor}: ${trimmed}`
    }
    case 'batch_passed': {
      const p = payload as {
        batchLabel?: string
        toStep?: string
      }
      const relay = p.batchLabel ? `"${p.batchLabel}"` : 'a relay'
      const stepLabel = p.toStep ? relayStepLabel(p.toStep) : ''
      const tail = stepLabel ? ` It is sitting at ${stepLabel}.` : ''
      return `${prefix}${actor} passed ${relay} to you.${tail}`
    }
    case 'batch_sent_back': {
      const p = payload as { batchLabel?: string }
      const relay = p.batchLabel ? `"${p.batchLabel}"` : 'a relay'
      return `${prefix}${actor} sent ${relay} back to you for changes.`
    }
    case 'batch_revision_dispatched': {
      const p = payload as { itemType?: string; itemDescription?: string }
      const itemType = p.itemType ?? 'item'
      const desc = p.itemDescription ?? ''
      const short = desc.length > 60 ? desc.slice(0, 57) + '…' : desc
      return `${prefix}${actor} asked you to revise ${itemType}: "${short}"`
    }
    case 'batch_revision_completed':
      return `${prefix}${actor} marked the revision complete.`
    case 'batch_step_advanced': {
      const p = payload as { batchLabel?: string; toSubState?: string }
      const relay = p.batchLabel ? `"${p.batchLabel}"` : 'a relay'
      const stepLabel = p.toSubState ? relayStepLabel(p.toSubState) : ''
      const tail = stepLabel ? ` to ${stepLabel}` : ''
      return `${prefix}${actor} moved ${relay}${tail}.`
    }
    case 'run_completed': {
      const count = (payload as { postCount?: number }).postCount
      if (typeof count === 'number') {
        return `${prefix}Generation complete: ${count} posts ready for your review.`
      }
      return `${prefix}Generation complete: posts ready for your review.`
    }
    case 'client_am_assigned':
      return `${prefix}${actor} assigned you as the Account Manager for ${clientName}.`
    case 'client_designer_assigned':
      return `${prefix}${actor} assigned you as the Designer for ${clientName}.`
    case 'member_role_changed': {
      const p = payload as { toRole?: string }
      const toRole = p.toRole ?? 'a new role'
      return `${prefix}${actor} changed your role to ${toRole}.`
    }
    case 'run_failed': {
      const p = payload as { targetMonth?: string }
      const month = p.targetMonth ?? 'Content'
      return `${prefix}${month} content generation failed for ${clientName}.`
    }
    default:
      return `${prefix}${actor} mentioned you.`
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
