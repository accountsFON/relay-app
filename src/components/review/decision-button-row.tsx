'use client'

import { Check, AlertCircle, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReviewDecisionType } from '@/types/review-session'

export type DecisionButtonRowProps = {
  value: ReviewDecisionType
  onChange: (decision: ReviewDecisionType) => void
  disabled?: boolean
  className?: string
}

type DecisionConfig = {
  decision: Exclude<ReviewDecisionType, 'not_reviewed'>
  label: string
  ariaLabel: string
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  filledClass: string
  outlineClass: string
}

const DECISIONS: ReadonlyArray<DecisionConfig> = [
  {
    decision: 'approved',
    label: 'Approve',
    ariaLabel: 'Approve this post',
    icon: Check,
    // Green: emerald-600 background, white text + icon
    filledClass: 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700',
    outlineClass:
      'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50',
  },
  {
    decision: 'changes_requested',
    label: 'Changes',
    ariaLabel: 'Request changes on this post',
    icon: AlertCircle,
    // Orange: amber-600 background
    filledClass: 'bg-amber-600 text-white border-amber-600 hover:bg-amber-700',
    outlineClass:
      'bg-white text-amber-700 border-amber-300 hover:bg-amber-50',
  },
  {
    decision: 'caption_edited',
    label: 'Edit Copy',
    ariaLabel: 'Edit copy on this post',
    icon: Pencil,
    // Blue: sky-600 background
    filledClass: 'bg-sky-600 text-white border-sky-600 hover:bg-sky-700',
    outlineClass:
      'bg-white text-sky-700 border-sky-300 hover:bg-sky-50',
  },
]

/**
 * Three pill buttons rendered in a row: Approve / Request Changes / Edit Copy.
 *
 * WCAG compliance: color + icon + label per button (so color is never the only
 * channel conveying decision state). 44pt minimum touch target via min-w/min-h.
 * Each button carries an aria-label describing the action.
 *
 * Active decision is rendered filled; the others render outlined. Tapping the
 * already-active decision is a no-op at the UI layer (parent still receives
 * onChange so it can decide whether to toggle off).
 */
export function DecisionButtonRow({
  value,
  onChange,
  disabled,
  className,
}: DecisionButtonRowProps) {
  return (
    <div
      role="group"
      aria-label="Review decision"
      data-testid="decision-button-row"
      className={cn('flex w-full items-stretch gap-2', className)}
    >
      {DECISIONS.map((cfg) => {
        const Icon = cfg.icon
        const isActive = value === cfg.decision
        return (
          <button
            key={cfg.decision}
            type="button"
            aria-label={cfg.ariaLabel}
            aria-pressed={isActive}
            data-decision={cfg.decision}
            data-active={isActive ? 'true' : 'false'}
            data-testid={`decision-button-${cfg.decision}`}
            onClick={() => onChange(cfg.decision)}
            disabled={disabled}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              // 44pt touch target
              'min-h-[44px] min-w-[44px]',
              isActive ? cfg.filledClass : cfg.outlineClass,
            )}
          >
            <Icon aria-hidden className="h-4 w-4" />
            <span>{cfg.label}</span>
          </button>
        )
      })}
    </div>
  )
}
