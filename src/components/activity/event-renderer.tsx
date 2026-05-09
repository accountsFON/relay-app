/**
 * EventRenderer — switch on ActivityKind, return one row per event.
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
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { tokenizeBody } from '@/lib/mentions'
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
        message: `sent ${p.batchLabel} back to ${p.toUserName} — "${truncate(p.reason, 60)}"`,
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
    case 'batch_step_advanced':
      if (p.kind !== 'batch_step_advanced') break
      return {
        icon: Sparkles,
        tone: 'default',
        message: `advanced ${p.batchLabel}: ${p.fromSubState} → ${p.toSubState}`,
      }
  }
  // Fallback for not-yet-modeled kinds.
  return {
    icon: MessageCircle,
    tone: 'default',
    message: humanizeKind(event.kind),
  }
}

function toneClasses(tone: Tone): string {
  switch (tone) {
    case 'success':
      return 'text-green-900 bg-green-50/60'
    case 'warning':
      return 'text-amber-900 bg-amber-50/60'
    case 'destructive':
      return 'text-red-900 bg-red-50/60'
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
