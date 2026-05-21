/**
 * Pure notification copy + deep link resolver.
 *
 * Shared by:
 *   - src/app/(app)/inbox/inbox-row.tsx
 *   - src/components/notifications/notification-row.tsx (Phase 1)
 *
 * Spec: projects/relay-app/2026-05-21-notification-bell-and-heartbeat-design.md
 */
import { relayStepLabel } from '@/lib/relay-step-labels'
import type { MentionInboxRow } from '@/components/activity/types'

export function renderSummary(row: MentionInboxRow): string {
  const actor = row.event.actor?.name ?? 'Someone'
  const clientName = row.client.name
  const payload = row.event.payload as Record<string, unknown>
  const prefix = `${clientName} · `

  switch (payload.kind) {
    case 'comment': {
      const body = (payload.body as string) ?? ''
      const trimmed = body.length > 120 ? body.slice(0, 117) + '…' : body
      return `${prefix}${actor}: ${trimmed}`
    }
    case 'batch_passed': {
      const batchLabel = payload.batchLabel as string | undefined
      const toStep = payload.toStep as string | undefined
      const relay = batchLabel ? `"${batchLabel}"` : 'a relay'
      const stepLabel = toStep ? relayStepLabel(toStep) : ''
      const tail = stepLabel ? ` It is sitting at ${stepLabel}.` : ''
      return `${prefix}${actor} passed ${relay} to you.${tail}`
    }
    case 'batch_sent_back': {
      const batchLabel = payload.batchLabel as string | undefined
      const relay = batchLabel ? `"${batchLabel}"` : 'a relay'
      return `${prefix}${actor} sent ${relay} back to you for changes.`
    }
    case 'batch_revision_dispatched': {
      const itemType = (payload.itemType as string) ?? 'item'
      const desc = (payload.itemDescription as string) ?? ''
      const short = desc.length > 60 ? desc.slice(0, 57) + '…' : desc
      return `${prefix}${actor} asked you to revise ${itemType}: "${short}"`
    }
    case 'batch_revision_completed':
      return `${prefix}${actor} marked the revision complete.`
    case 'batch_step_advanced': {
      const batchLabel = payload.batchLabel as string | undefined
      const toSubState = payload.toSubState as string | undefined
      const relay = batchLabel ? `"${batchLabel}"` : 'a relay'
      const stepLabel = toSubState ? relayStepLabel(toSubState) : ''
      const tail = stepLabel ? ` to ${stepLabel}` : ''
      return `${prefix}${actor} moved ${relay}${tail}.`
    }
    case 'run_completed': {
      const count = payload.postCount
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
      const toRole = (payload.toRole as string) ?? 'a new role'
      return `${prefix}${actor} changed your role to ${toRole}.`
    }
    case 'run_failed': {
      const month = (payload.targetMonth as string) ?? 'Content'
      return `${prefix}${month} content generation failed for ${clientName}.`
    }
    default:
      return `${prefix}${actor} mentioned you.`
  }
}

export function resolveHref(row: MentionInboxRow): string {
  const payload = row.event.payload as Record<string, unknown>
  const batchId = typeof payload.batchId === 'string' ? payload.batchId : null
  if (batchId) {
    return `/clients/${row.client.id}/batches/${batchId}`
  }
  if (row.event.runId) {
    return `/clients/${row.client.id}/runs/${row.event.runId}`
  }
  return `/clients/${row.client.id}`
}
