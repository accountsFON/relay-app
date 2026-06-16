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

  // Switch on the event column kind, NOT payload.kind. Emit sites
  // (preview-review-emit, threads, magicLink, posts, reviewSessions) set
  // ActivityEvent.kind on the column but do not inject `kind` into the JSONB
  // payload. Switching on payload.kind would always fall through to the
  // default "X mentioned you" copy in production.
  switch (row.event.kind) {
    case 'comment': {
      const body = (payload.body as string) ?? ''
      const trimmed = body.length > 120 ? body.slice(0, 117) + '…' : body
      return `${prefix}${actor}: ${trimmed}`
    }
    case 'batch_passed': {
      const batchLabel = payload.batchLabel as string | undefined
      const toStep = payload.toStep as string | undefined
      const wasOverride = payload.wasOverride === true
      const relay = batchLabel ? `"${batchLabel}"` : 'a relay'
      const stepLabel = toStep ? relayStepLabel(toStep) : ''
      const tail = stepLabel ? ` Now at ${stepLabel}.` : ''
      const verb = wasOverride
        ? 'overrode the holder and passed'
        : 'passed'
      return `${prefix}${actor} ${verb} you the baton on ${relay}.${tail}`
    }
    case 'batch_sent_back': {
      const batchLabel = payload.batchLabel as string | undefined
      const toStep = payload.toStep as string | undefined
      const wasOverride = payload.wasOverride === true
      const relay = batchLabel ? `"${batchLabel}"` : 'a relay'
      const stepLabel = toStep ? relayStepLabel(toStep) : ''
      const tail = stepLabel ? ` Now at ${stepLabel}.` : ''
      const verb = wasOverride
        ? 'overrode the holder and sent'
        : 'sent'
      return `${prefix}${actor} ${verb} ${relay} back to you for changes.${tail}`
    }
    case 'batch_completed': {
      const batchLabel = payload.batchLabel as string | undefined
      const wasOverride = payload.wasOverride === true
      const relay = batchLabel ? `"${batchLabel}"` : 'a relay'
      const verb = wasOverride
        ? 'overrode the holder and brought'
        : 'brought'
      return `${prefix}${actor} ${verb} ${relay} across the finish line.`
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
    case 'batch_force_stepped': {
      const batchLabel = payload.batchLabel as string | undefined
      const toStep = payload.toStep as string | undefined
      const relay = batchLabel ? `"${batchLabel}"` : 'a relay'
      const stepLabel = toStep ? relayStepLabel(toStep) : ''
      const tail = stepLabel ? ` to ${stepLabel}` : ''
      return `${prefix}${actor} force moved ${relay}${tail}.`
    }
    case 'run_completed': {
      const count = payload.postCount
      if (typeof count === 'number') {
        return `${prefix}Content generation complete: ${count} posts ready for your review.`
      }
      return `${prefix}Content generation complete: posts ready for your review.`
    }
    case 'client_am_assigned':
      return `${prefix}${actor} assigned you as the Account Manager for ${clientName}.`
    case 'client_designer_assigned':
      return `${prefix}${actor} assigned you as the Designer for ${clientName}.`
    case 'client_am_unassigned':
      return `${prefix}${actor} removed you as the Account Manager for ${clientName}.`
    case 'client_designer_unassigned':
      return `${prefix}${actor} removed you as the Designer for ${clientName}.`
    case 'member_role_changed': {
      const toRole = (payload.toRole as string) ?? 'a new role'
      return `${prefix}${actor} changed your role to ${toRole}.`
    }
    case 'run_failed': {
      const month = (payload.targetMonth as string) ?? 'Content'
      return `${prefix}${month} content generation failed for ${clientName}.`
    }
    case 'review_session_started': {
      const round = (payload.round as number) ?? 1
      return `${prefix}Client review round ${round} started.`
    }
    case 'review_session_submitted': {
      const s = payload.summary as { approved: number; changesRequested: number; captionEdited: number } | undefined
      if (s) {
        return `${prefix}Client review submitted (${s.approved} approved, ${s.changesRequested} changes, ${s.captionEdited} edits).`
      }
      return `${prefix}Client review submitted.`
    }
    case 'review_caption_edit_accepted': {
      const postId = (payload.postId as string) ?? ''
      return `${prefix}${actor} accepted the client caption edit on post ${postId.slice(0, 6)}.`
    }
    case 'review_item_addressed': {
      const postId = (payload.postId as string) ?? ''
      return `${prefix}${actor} marked feedback addressed on post ${postId.slice(0, 6)}.`
    }
    case 'review_item_unaddressed': {
      return `${prefix}A post was moved back to unaddressed in a review session.`
    }
    case 'review_round_started': {
      const round = (payload.round as number) ?? 1
      return `${prefix}Round ${round} review opened.`
    }
    case 'post_thread_opened': {
      const postId = (payload.postId as string) ?? ''
      return `${prefix}${actor} opened a thread on post ${postId.slice(0, 6)}.`
    }
    case 'post_thread_resolved': {
      const postId = (payload.postId as string) ?? ''
      const reason = payload.resolvedReason as string | undefined
      if (reason) {
        return `${prefix}${actor} resolved the thread on post ${postId.slice(0, 6)} ("${reason}").`
      }
      return `${prefix}${actor} resolved the thread on post ${postId.slice(0, 6)}.`
    }
    case 'magic_link_created': {
      const recipient = (payload.recipientName as string) ?? 'a reviewer'
      const expiresAt = payload.expiresAt as string | undefined
      const expires = expiresAt
        ? new Date(expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
        : 'soon'
      return `${prefix}Review link sent to ${recipient}, expires ${expires}.`
    }
    case 'magic_link_visited': {
      const reviewer = (payload.reviewerName as string) ?? 'A reviewer'
      const isFirst = payload.isFirstVisit === true
      const tail = isFirst ? 'first visit' : 'returning'
      return `${prefix}${reviewer} opened the review link (${tail}).`
    }
    case 'client_review_decided': {
      const batchLabel = payload.batchLabel as string | undefined
      const toStep = payload.toStep as string | undefined
      const decision = payload.decision as string | undefined
      const relay = batchLabel ? `"${batchLabel}"` : 'a relay'
      const stepLabel = toStep ? relayStepLabel(toStep) : ''
      const tail = stepLabel ? ` It is now at ${stepLabel}.` : ''
      return decision === 'approved'
        ? `${prefix}Your client approved ${relay}.${tail}`
        : `${prefix}Your client requested changes on ${relay}.${tail}`
    }
    case 'post_caption_ai_fixed': {
      const postId = (payload.postId as string) ?? ''
      return `${prefix}${actor} used AI to fix the caption on post ${postId.slice(0, 6)}.`
    }
    case 'preview_review_submitted': {
      const count = (payload.commentCount as number) ?? 0
      return `${prefix}${actor} finished reviewing the preview (${count} comments).`
    }
    case 'revision_images_requested': {
      const batchLabel = payload.batchLabel as string | undefined
      const relay = batchLabel ? `"${batchLabel}"` : 'a relay'
      return `${prefix}Image revisions requested on ${relay}. Open the review to see the pinned graphics.`
    }
    default:
      return `${prefix}${actor} mentioned you.`
  }
}

/**
 * Full deep link for a notification, including the anchor fragment the
 * destination page's <EventAnchor /> consumes. Precedence:
 *
 *   1. Post event (`event.postId` + a resolvable batch) ->
 *      `/clients/{c}/batches/{b}#post-{postId}` (scrolls to the post card)
 *   2. Batch-scoped non-post event (`payload.batchId`) ->
 *      `/clients/{c}/batches/{b}#comment-{eventId}` (scrolls to the thread row)
 *   3. Run event (`runId` only) -> `/clients/{c}/runs/{runId}` (nothing to anchor)
 *   4. Client thread fallback -> `/clients/{c}#comment-{eventId}`
 *
 * Both consumers (the bell row and the inbox row) use this verbatim, so the
 * fragment lives here, not in the row components.
 */
export function resolveHref(row: MentionInboxRow): string {
  const payload = row.event.payload as Record<string, unknown>
  const clientId = row.client.id
  const eventId = row.event.id

  if (row.event.postId && row.postBatchId) {
    return `/clients/${clientId}/batches/${row.postBatchId}#post-${row.event.postId}`
  }
  const reviewSessionId =
    typeof payload.reviewSessionId === 'string' ? payload.reviewSessionId : null
  const batchForReview = typeof payload.batchId === 'string' ? payload.batchId : null
  if (reviewSessionId && batchForReview) {
    return `/clients/${clientId}/batches/${batchForReview}/review-sessions/${reviewSessionId}`
  }
  const batchId = typeof payload.batchId === 'string' ? payload.batchId : null
  if (batchId) {
    return `/clients/${clientId}/batches/${batchId}#comment-${eventId}`
  }
  if (row.event.runId) {
    return `/clients/${clientId}/runs/${row.event.runId}`
  }
  return `/clients/${clientId}#comment-${eventId}`
}
