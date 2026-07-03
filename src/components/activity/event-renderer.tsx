/**
 * EventRenderer, switch on ActivityKind, return one row per event.
 *
 * Spec: projects/relay-app/2026-05-09-activity-thread-plan.md § EventRenderer
 *       projects/relay-app/2026-05-09-relay-workflow-design.md § Phase 4
 *
 * Behavior (V1):
 * - One renderer per kind. Comment renders full card with avatar; system
 *   events render as compact one-liners with icon + actor + timestamp.
 * - Batch_* kinds (Phase 4) get bespoke renderers calling out the relay
 *   transition with role color hints.
 *
 * Phase: shells for `comment`, `batch_passed`, `batch_sent_back`,
 *        `batch_revision_dispatched`, `batch_revision_completed`,
 *        `batch_step_advanced`. Other kinds get a generic fallback.
 *        Phase 2: humanize comment payload + render @chips.
 *        Phase 4: tighten batch_* renderers with role color tokens.
 *
 * Schema dep: ActivityKind enum stable, payload shapes follow the spec.
 */
import type { ActivityKind } from '@prisma/client'
import {
  ArrowRight,
  ArrowLeft,
  Check,
  CircleDot,
  Eye,
  Image,
  Link as LinkIcon,
  MessageCircle,
  MessageSquarePlus,
  Sparkles,
  Pencil,
  Plus,
  Archive,
  UserPlus,
  UserMinus,
  ShieldCheck,
  PlayCircle,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Linkify } from '@/components/ui/linkify'
import { cn } from '@/lib/utils'
import { initials } from '@/lib/initials'
import { tokenizeBody } from '@/lib/mentions'
import { relayStepLabel } from '@/lib/relay-step-labels'
import { formatRelative } from '@/lib/format-relative'
import type { ActivityEventView, FieldChange } from './types'
import { CaptionAiFixedRow } from './caption-ai-fixed-row'
import { EditDiffRow } from './edit-diff-row'
import { ReviewCaptionEditRow } from './review-caption-edit-row'
import { humanizeFieldName } from './field-labels'

export interface EventRendererProps {
  event: ActivityEventView
  className?: string
}

export function EventRenderer({ event, className }: EventRendererProps) {
  if (event.kind === 'comment') {
    return <CommentRow event={event} className={className} />
  }
  // NOTE: dispatch on event.kind (the ActivityEvent column, always set by the
  // read path), NOT event.payload.kind. Writers store the payload object
  // verbatim WITHOUT a `kind` field (see fixWithAi / reviewSessions), and
  // recordActivity does not inject one, so event.payload.kind is undefined in
  // production. Payload fields are read defensively below.
  if (event.kind === 'post_caption_ai_fixed') {
    const p = event.payload as { postId?: string; oldCaption?: string; newCaption?: string }
    if (typeof p.oldCaption === 'string' && typeof p.newCaption === 'string') {
      return (
        <CaptionAiFixedRow
          actorName={event.actor?.name ?? 'Someone'}
          postRef={shortPostRef(p.postId ?? '')}
          oldCaption={p.oldCaption}
          newCaption={p.newCaption}
          createdAtLabel={formatRelative(event.createdAt)}
          className={className}
        />
      )
    }
  }
  if (event.kind === 'client_profile_edited' || event.kind === 'post_edited') {
    const changes = (event.payload as { changes?: FieldChange[] }).changes
    if (changes && changes.length > 0) {
      return (
        <EditDiffRow
          actorName={event.actor?.name ?? 'Someone'}
          subject={event.kind === 'post_edited' ? 'post' : 'profile'}
          changes={changes}
          createdAtLabel={formatRelative(event.createdAt)}
          className={className}
        />
      )
    }
  }
  if (event.kind === 'review_caption_edit_accepted') {
    const p = event.payload as { postId?: string; oldCaption?: string; newCaption?: string }
    if (typeof p.oldCaption === 'string' && typeof p.newCaption === 'string') {
      return (
        <ReviewCaptionEditRow
          actorName={event.actor?.name ?? 'Someone'}
          postRef={shortPostRef(p.postId ?? '')}
          oldCaption={p.oldCaption}
          newCaption={p.newCaption}
          createdAtLabel={formatRelative(event.createdAt)}
          className={className}
        />
      )
    }
  }
  return <SystemEventRow event={event} className={className} />
}

function CommentRow({ event, className }: EventRendererProps) {
  if (event.payload.kind !== 'comment') return null
  const actor = event.actor

  return (
    <div
      className={cn(
        'flex gap-3 rounded-md px-3 py-2 hover:bg-muted/30',
        className
      )}
      data-event-kind="comment"
    >
      <Avatar size="sm" className="mt-0.5">
        {actor?.avatarUrl && <AvatarImage src={actor.avatarUrl} />}
        <AvatarFallback>{initials(actor?.name ?? '?')}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-baseline gap-2">
          <p className="text-[13px] font-semibold text-foreground">
            {actor?.name ?? 'Unknown'}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {formatRelative(event.createdAt)}
          </p>
        </div>
        <p className="text-[14px] leading-snug text-foreground whitespace-pre-wrap break-words">
          {tokenizeBody(event.payload.body).map((tok, i) =>
            tok.type === 'mention' ? (
              <span
                key={i}
                className="rounded bg-neutral-100 px-1 py-0.5 text-[13px] font-medium text-foreground"
              >
                @{tok.handle}
              </span>
            ) : tok.type === 'link' ? (
              <a
                key={i}
                href={tok.href}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-blue-600 underline underline-offset-2 hover:text-blue-700"
              >
                {tok.value}
              </a>
            ) : (
              <span key={i}>{tok.value}</span>
            ),
          )}
        </p>
      </div>
    </div>
  )
}

function SystemEventRow({ event, className }: EventRendererProps) {
  const { icon: Icon, message, tone } = describeEvent(event)

  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-md px-3 py-1.5 text-[12px]',
        toneClasses(tone),
        className
      )}
      data-event-kind={event.kind}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      <p className="min-w-0 flex-1 break-words">
        {event.actor && <span className="font-medium">{event.actor.name} · </span>}
        {/* System messages embed user-entered free text (send-back / force-move
            / thread-resolved reasons), so URLs must be clickable too. */}
        <Linkify text={message} />
      </p>
      <span className="mt-0.5 shrink-0 text-[11px] text-muted-foreground">
        {formatRelative(event.createdAt)}
      </span>
    </div>
  )
}

type Tone = 'default' | 'success' | 'warning' | 'destructive'

interface RenderedEvent {
  icon: React.ComponentType<{ className?: string }>
  message: string
  tone: Tone
}

function describeEvent(event: ActivityEventView): RenderedEvent {
  const p = event.payload
  switch (event.kind) {
    case 'batch_passed': {
      if (p.kind !== 'batch_passed') break
      const stepLabel = relayStepLabel(p.toStep)
      const where = stepLabel ? `, now at ${stepLabel}` : ''
      return {
        icon: ArrowRight,
        tone: 'success',
        message: p.wasOverride
          ? `overrode the holder and passed the baton on ${p.batchLabel} to ${p.toUserName}${where}`
          : `passed the baton on ${p.batchLabel} to ${p.toUserName}${where}`,
      }
    }
    case 'batch_sent_back': {
      if (p.kind !== 'batch_sent_back') break
      const stepLabel = relayStepLabel(p.toStep)
      const where = stepLabel ? `, now at ${stepLabel}` : ''
      return {
        icon: ArrowLeft,
        tone: 'warning',
        message: p.wasOverride
          ? `overrode the holder and sent ${p.batchLabel} back to ${p.toUserName} for changes${where}. Reason: "${truncate(p.reason, 60)}"`
          : `sent ${p.batchLabel} back to ${p.toUserName} for changes${where}. Reason: "${truncate(p.reason, 60)}"`,
      }
    }
    case 'batch_revision_dispatched':
      if (p.kind !== 'batch_revision_dispatched') break
      return {
        icon: CircleDot,
        tone: 'default',
        message: `dispatched ${p.itemType} revision to ${p.assignedToName}: "${truncate(p.itemDescription, 50)}"`,
      }
    case 'batch_revision_completed':
      if (p.kind !== 'batch_revision_completed') break
      return {
        icon: Check,
        tone: 'success',
        message: p.itemType
          ? `completed ${p.itemType} revision: "${truncate(p.itemDescription ?? '', 50)}"`
          : 'marked revisions done',
      }
    case 'batch_completed':
      if (p.kind !== 'batch_completed') break
      return {
        icon: Check,
        tone: 'success',
        message: p.wasOverride
          ? `overrode the holder and brought ${p.batchLabel} across the finish line`
          : `brought ${p.batchLabel} across the finish line`,
      }
    case 'batch_force_stepped':
      if (p.kind !== 'batch_force_stepped') break
      return {
        icon: ShieldCheck,
        tone: 'warning',
        message: p.reason
          ? `force moved ${p.batchLabel} from ${relayStepLabel(p.fromStep)} to ${relayStepLabel(p.toStep)}. Reason: "${truncate(p.reason, 60)}"`
          : `force moved ${p.batchLabel} from ${relayStepLabel(p.fromStep)} to ${relayStepLabel(p.toStep)}`,
      }
    case 'batch_step_advanced':
      if (p.kind !== 'batch_step_advanced') break
      return {
        icon: Sparkles,
        tone: 'default',
        message: `moved ${p.batchLabel} from ${relayStepLabel(p.fromSubState)} to ${relayStepLabel(p.toSubState)}`,
      }
    case 'client_created': {
      const name = stringField(p, 'clientName')
      return {
        icon: Plus,
        tone: 'success',
        message: name ? `created client ${name}` : 'created this client',
      }
    }
    case 'client_profile_edited': {
      const fields = stringArrayField(p, 'fieldsChanged').map(humanizeFieldName)
      return {
        icon: Pencil,
        tone: 'default',
        message: fields.length
          ? `edited profile: ${fields.slice(0, 3).join(', ')}${fields.length > 3 ? ` +${fields.length - 3} more` : ''}`
          : 'edited profile',
      }
    }
    case 'client_archived':
      return { icon: Archive, tone: 'warning', message: 'archived this client' }
    case 'client_am_assigned': {
      const name = stringField(p, 'assignedToName')
      return {
        icon: UserPlus,
        tone: 'default',
        message: name ? `assigned ${name} as Account Manager` : 'assigned an Account Manager',
      }
    }
    case 'client_am_unassigned': {
      const name = stringField(p, 'unassignedFromName')
      return {
        icon: UserMinus,
        tone: 'default',
        message: name ? `removed ${name} as Account Manager` : 'removed the Account Manager',
      }
    }
    case 'client_designer_assigned': {
      const name = stringField(p, 'assignedToName')
      return {
        icon: UserPlus,
        tone: 'default',
        message: name ? `assigned ${name} as Designer` : 'assigned a Designer',
      }
    }
    case 'client_designer_unassigned': {
      const name = stringField(p, 'unassignedFromName')
      return {
        icon: UserMinus,
        tone: 'default',
        message: name ? `removed ${name} as Designer` : 'removed the Designer',
      }
    }
    case 'member_role_changed': {
      const name = stringField(p, 'targetUserName')
      const fromRole = stringField(p, 'fromRole')
      const toRole = stringField(p, 'toRole')
      // No op transitions (same role twice) usually mean "permission overrides
      // updated" rather than an actual role change. Don't pretend the role
      // changed when it didn't.
      const isNoOp = fromRole && toRole && fromRole === toRole
      return {
        icon: ShieldCheck,
        tone: 'default',
        message: isNoOp
          ? `updated ${name ?? 'a member'}'s permissions`
          : `changed ${name ?? 'a member'}'s role: ${fromRole ?? '?'} → ${toRole ?? '?'}`,
      }
    }
    case 'post_edited': {
      const fields = stringArrayField(p, 'fieldsChanged').map(humanizeFieldName)
      return {
        icon: Pencil,
        tone: 'default',
        message: fields.length
          ? `edited post: ${fields.slice(0, 3).join(', ')}`
          : 'edited a post',
      }
    }
    case 'run_started': {
      const month = stringField(p, 'targetMonth')
      return {
        icon: PlayCircle,
        tone: 'default',
        message: month ? `started content generation for ${month}` : 'started content generation',
      }
    }
    case 'run_completed': {
      const month = stringField(p, 'targetMonth')
      const postCount = numberField(p, 'postCount')
      return {
        icon: CheckCircle2,
        tone: 'success',
        message:
          month && postCount !== null
            ? `${month} content generation complete, ${postCount} posts ready for review`
            : 'content generation complete',
      }
    }
    case 'run_failed': {
      const month = stringField(p, 'targetMonth')
      return {
        icon: AlertTriangle,
        tone: 'destructive',
        message: month ? `${month} content generation failed` : 'content generation failed',
      }
    }
    case 'post_thread_opened': {
      if (p.kind !== 'post_thread_opened') break
      const postRef = shortPostRef(p.postId)
      return {
        icon: MessageSquarePlus,
        tone: 'default',
        message: `opened a thread on ${postRef}${pinLocationSummary(p.pinLocation)}`,
      }
    }
    case 'post_thread_resolved': {
      if (p.kind !== 'post_thread_resolved') break
      const postRef = shortPostRef(p.postId)
      const reason = p.resolvedReason
      return {
        icon: Check,
        tone: 'success',
        message: reason
          ? `resolved a thread on ${postRef}. Reason: "${truncate(reason, 60)}"`
          : `resolved a thread on ${postRef}`,
      }
    }
    case 'magic_link_created': {
      if (p.kind !== 'magic_link_created') break
      const expires = formatDateShort(p.expiresAt)
      return {
        icon: LinkIcon,
        tone: 'default',
        message: `sent a review link to ${p.recipientName}, expires ${expires}`,
      }
    }
    case 'magic_link_visited': {
      if (p.kind !== 'magic_link_visited') break
      const suffix = p.isFirstVisit ? 'first visit' : 'returning'
      return {
        icon: Eye,
        tone: 'default',
        // Reviewer name is the actor here; lead with the name rather than
        // the actor prefix the SystemEventRow adds.
        message: `${p.reviewerName} opened the review link (${suffix})`,
      }
    }
    case 'review_session_started': {
      if (p.kind !== 'review_session_started') break
      return {
        icon: PlayCircle,
        tone: 'default',
        message: `started review, round ${p.round}`,
      }
    }
    case 'review_session_submitted': {
      if (p.kind !== 'review_session_submitted') break
      const s = p.summary
      const chips = [
        `${s.approved} approved`,
        `${s.changesRequested} changes`,
        `${s.captionEdited} edits`,
      ].join(', ')
      return {
        icon: CheckCircle2,
        tone: 'success',
        message: `submitted review, round ${p.round} (${chips})`,
      }
    }
    case 'review_caption_edit_accepted': {
      if (p.kind !== 'review_caption_edit_accepted') break
      const postRef = shortPostRef(p.postId)
      return {
        icon: Check,
        tone: 'success',
        message: `accepted client caption edit on ${postRef}`,
      }
    }
    case 'review_item_addressed': {
      if (p.kind !== 'review_item_addressed') break
      const postRef = shortPostRef(p.postId)
      return {
        icon: Check,
        tone: 'success',
        message: `marked feedback addressed on ${postRef}`,
      }
    }
    case 'review_item_unaddressed': {
      if (p.kind !== 'review_item_unaddressed') break
      return {
        icon: ArrowLeft,
        tone: 'warning',
        message: p.unaccepted
          ? 'undid the accepted caption edit and moved the post back to unaddressed'
          : 'moved a post back to unaddressed',
      }
    }
    case 'review_round_started': {
      if (p.kind !== 'review_round_started') break
      return {
        icon: ArrowRight,
        tone: 'default',
        message: `opened round ${p.round} for re-review`,
      }
    }
    case 'client_review_decided': {
      if (p.kind !== 'client_review_decided') break
      return {
        icon: p.decision === 'approved' ? CheckCircle2 : ArrowLeft,
        tone: p.decision === 'approved' ? 'success' : 'warning',
        message:
          p.decision === 'approved'
            ? `client approved ${p.batchLabel}, moved to ${relayStepLabel(p.toStep)}`
            : `client requested changes on ${p.batchLabel}, moved to ${relayStepLabel(p.toStep)}`,
      }
    }
    case 'revision_images_requested': {
      if (p.kind !== 'revision_images_requested') break
      return {
        icon: Image,
        tone: 'default',
        message: 'Image revisions requested — designer notified',
      }
    }
    case 'post_comment_added': {
      const postRef = shortPostRef(stringField(p, 'postId') ?? '')
      return {
        icon: MessageSquarePlus,
        tone: 'default',
        message: `replied on ${postRef}`,
      }
    }
    case 'design_changes_requested': {
      const batchLabel = stringField(p, 'batchLabel')
      const relay = batchLabel ? `"${batchLabel}"` : 'this relay'
      return {
        icon: Pencil,
        tone: 'default',
        message: `requested design changes on ${relay} — designer notified`,
      }
    }
    case 'feedback_sent_to_designer': {
      if (p.kind !== 'feedback_sent_to_designer') break
      const relay = p.batchLabel ? `"${p.batchLabel}"` : 'this relay'
      const n = p.count
      return {
        icon: MessageSquarePlus,
        tone: 'default',
        message: `sent ${n} feedback ${n === 1 ? 'item' : 'items'} to designer on ${relay}`,
      }
    }
  }
  // Fallback for not-yet-modeled kinds.
  return {
    icon: MessageCircle,
    tone: 'default',
    message: humanizeKind(event.kind),
  }
}

function stringField(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== 'object') return null
  const v = (payload as Record<string, unknown>)[key]
  return typeof v === 'string' && v.length > 0 ? v : null
}
function stringArrayField(payload: unknown, key: string): string[] {
  if (!payload || typeof payload !== 'object') return []
  const v = (payload as Record<string, unknown>)[key]
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}
function numberField(payload: unknown, key: string): number | null {
  if (!payload || typeof payload !== 'object') return null
  const v = (payload as Record<string, unknown>)[key]
  return typeof v === 'number' ? v : null
}

function toneClasses(tone: Tone): string {
  switch (tone) {
    case 'success':
      return 'text-foreground bg-neutral-100'
    case 'warning':
      return 'text-neutral-700 bg-neutral-100'
    case 'destructive':
      return 'text-destructive bg-destructive/10'
    default:
      return 'text-muted-foreground'
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s
}

/**
 * Compact post reference used in event copy. The activity surface doesn't
 * have post titles, so we use a short id slice, readable enough to scan,
 * unique enough to dedupe.
 */
function shortPostRef(postId: string): string {
  return `post ${postId.slice(0, 6)}`
}

function pinLocationSummary(loc: 'post' | 'image' | 'caption'): string {
  switch (loc) {
    case 'image':
      return ' (image pin)'
    case 'caption':
      return ' (caption)'
    default:
      return ''
  }
}

function formatDateShort(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'soon'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function humanizeKind(kind: ActivityKind): string {
  return kind.replace(/_/g, ' ')
}


