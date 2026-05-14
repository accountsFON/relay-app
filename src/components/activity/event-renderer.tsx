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
  MessageCircle,
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
import { cn } from '@/lib/utils'
import { tokenizeBody } from '@/lib/mentions'
import { relayStepLabel } from '@/lib/relay-step-labels'
import type { ActivityEventView } from './types'

export interface EventRendererProps {
  event: ActivityEventView
  className?: string
}

export function EventRenderer({ event, className }: EventRendererProps) {
  if (event.kind === 'comment') {
    return <CommentRow event={event} className={className} />
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
        <p className="text-[14px] leading-snug text-foreground whitespace-pre-wrap">
          {tokenizeBody(event.payload.body).map((tok, i) =>
            tok.type === 'mention' ? (
              <span
                key={i}
                className="rounded bg-cream-warm px-1 py-0.5 text-[13px] font-medium text-foreground"
              >
                @{tok.handle}
              </span>
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
        'flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[12px]',
        toneClasses(tone),
        className
      )}
      data-event-kind={event.kind}
    >
      <Icon className="size-3.5 shrink-0" />
      <p className="min-w-0 flex-1 truncate">
        {event.actor && <span className="font-medium">{event.actor.name} · </span>}
        {message}
      </p>
      <span className="shrink-0 text-[11px] text-muted-foreground">
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
    case 'batch_passed':
      if (p.kind !== 'batch_passed') break
      return {
        icon: ArrowRight,
        tone: 'success',
        message: `passed ${p.batchLabel} to ${p.toUserName}`,
      }
    case 'batch_sent_back':
      if (p.kind !== 'batch_sent_back') break
      return {
        icon: ArrowLeft,
        tone: 'warning',
        message: `sent ${p.batchLabel} back to ${p.toUserName}. Reason: "${truncate(p.reason, 60)}"`,
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
        message: `completed ${p.itemType} revision: "${truncate(p.itemDescription, 50)}"`,
      }
    case 'batch_completed':
      if (p.kind !== 'batch_completed') break
      return {
        icon: Check,
        tone: 'success',
        message: `finished ${p.batchLabel}`,
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
            ? `${month} run complete, ${postCount} posts ready for review`
            : 'content run complete',
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
      return 'text-foreground bg-cream-warm'
    case 'warning':
      return 'text-ink-80 bg-cream-warm'
    case 'destructive':
      return 'text-destructive bg-destructive/10'
    default:
      return 'text-muted-foreground'
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s
}

function humanizeKind(kind: ActivityKind): string {
  return kind.replace(/_/g, ' ')
}

/**
 * Map raw schema field keys to user-readable labels. Used when the activity
 * payload carries a `fieldsChanged` array sourced from a Prisma model or Zod
 * schema. Keys not in the map fall back to a spaced, capitalized form.
 */
const FIELD_NAME_LABELS: Record<string, string> = {
  // Client schema
  name: 'Name',
  businessSummary: 'Business summary',
  brandVoice: 'Brand voice',
  industry: 'Industry',
  location: 'Location',
  phone: 'Phone',
  mainCta: 'Main CTA',
  focus1: 'Focus 1',
  focus2: 'Focus 2',
  focus3: 'Focus 3',
  dos: 'Dos',
  donts: 'Donts',
  postingDays: 'Posting days',
  postLength: 'Post length',
  urls: 'URLs',
  targetAudience: 'Target audience',
  holidayHandling: 'Holiday handling',
  excludedDates: 'Excluded dates',
  assetsFolderUrl: 'Assets folder',
  canvaUrl: 'Canva URL',
  autoCrawl: 'Auto crawl',
  assignedAmId: 'Account Manager',
  assignedDesignerId: 'Designer',
  primaryAccountManagerId: 'Account Manager',
  status: 'Status',
  // Post schema
  caption: 'Caption',
  hashtags: 'Hashtags',
  graphicHook: 'Graphic hook',
  designerNotes: 'Designer notes',
}

function humanizeFieldName(key: string): string {
  if (FIELD_NAME_LABELS[key]) return FIELD_NAME_LABELS[key]
  // Convert camelCase or snake_case into Sentence case.
  const spaced = key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function formatRelative(d: Date): string {
  const diffMs = Date.now() - new Date(d).getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}
