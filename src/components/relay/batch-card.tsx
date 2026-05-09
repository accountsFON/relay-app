/**
 * BatchCard — card used in every kanban (AM, Designer, Client).
 *
 * Spec: projects/relay-app/2026-05-09-relay-workflow-design.md § Caleb-Surfaces
 *
 * Behavior (V1):
 * - Holder avatar (top right) + holder name.
 * - Days-on-current-step badge (yellow chip if > 48h, red if > 96h).
 * - Sub-status icon row (e.g., "3 revisions in progress", "N posts have client comments").
 * - Highlight border when current viewer holds the baton.
 * - Click navigates to /clients/[id]/batches/[batchId].
 *
 * Phase: shell now. Phase 3 finalizes sub-status icon vocabulary.
 * Schema dep: BatchSummary (placeholder).
 */
import Link from 'next/link'
import { Clock, MessageCircle, RefreshCw } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { STEP_LABEL, ROLE_COLOR } from './labels'
import type { BatchSummary } from './types'

export interface BatchCardSubStatus {
  /** "3 revisions in progress" / "5 posts have client comments" / etc. */
  label: string
  icon: 'comments' | 'revisions' | 'clock'
  tone?: 'default' | 'warning' | 'destructive'
}

export interface BatchCardProps {
  batch: BatchSummary
  /** True when the current viewer is the batch.currentHolder. */
  heldByMe: boolean
  /** Sub-status chips inferred per-card. Empty for now. */
  subStatuses?: BatchCardSubStatus[]
  href?: string
  className?: string
}

export function BatchCard({
  batch,
  heldByMe,
  subStatuses = [],
  href,
  className,
}: BatchCardProps) {
  const colors = ROLE_COLOR[batch.currentRole]
  const stuckTone =
    batch.daysOnCurrentStep >= 4
      ? 'destructive'
      : batch.daysOnCurrentStep >= 2
        ? 'warning'
        : 'default'

  const computedHref =
    href ?? `/clients/${batch.clientId}/batches/${batch.id}`

  return (
    <Link href={computedHref} className={cn('block', className)}>
      <Card
        size="sm"
        className={cn(
          'group/batch-card transition-all hover:shadow-sm',
          heldByMe && 'ring-2 ring-primary ring-offset-2'
        )}
        data-component="batch-card"
      >
        <div className="flex items-start justify-between gap-3 px-4">
          <div className="min-w-0 space-y-1">
            <p className="truncate text-[13px] font-semibold text-foreground">
              {batch.label}
            </p>
            <p className={cn('truncate text-[11px] uppercase tracking-wide', colors.text)}>
              {STEP_LABEL[batch.currentStep]}
              {batch.currentSubState && ` · ${batch.currentSubState}`}
            </p>
          </div>
          <Avatar size="sm" title={batch.holder.name}>
            {batch.holder.avatarUrl && <AvatarImage src={batch.holder.avatarUrl} />}
            <AvatarFallback>{initials(batch.holder.name)}</AvatarFallback>
          </Avatar>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 px-4">
          <Badge
            variant={stuckTone === 'default' ? 'secondary' : stuckTone}
            data-tone={stuckTone}
          >
            <Clock />
            {formatDays(batch.daysOnCurrentStep)}
          </Badge>
          {subStatuses.map((s, i) => (
            <Badge key={i} variant={s.tone === 'default' ? 'outline' : (s.tone ?? 'outline')}>
              {iconFor(s.icon)}
              {s.label}
            </Badge>
          ))}
        </div>
      </Card>
    </Link>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

function formatDays(days: number): string {
  if (days < 1) return 'today'
  if (days === 1) return '1 day'
  return `${days} days`
}

function iconFor(kind: BatchCardSubStatus['icon']) {
  switch (kind) {
    case 'comments':
      return <MessageCircle />
    case 'revisions':
      return <RefreshCw />
    case 'clock':
      return <Clock />
  }
}
