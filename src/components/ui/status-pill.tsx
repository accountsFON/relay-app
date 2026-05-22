/**
 * StatusPill — surface-level status / metadata pill primitive.
 *
 * Spec: projects/relay-app/2026-05-22-brand-implementation-plan.md
 *       § Task 2.5C.2 (Mockup 3 status pills) + Task 2.5C.3 carry-overs.
 *
 * Three visual variants for the brand refresh:
 * - `plain`: white bg + border + neutral text. Use for role chips ("AM"),
 *   hostname chips, and generic metadata labels.
 * - `dot`: white bg + border + leading colored dot. Use for identity-bearing
 *   pills like "Holder: Mollie Huebner".
 * - `accent`: tinted bg + accent text, no border. Use for warm / cool status
 *   signals like "4d on step", "Pending review".
 *
 * Renders as a `<span>` so it can be wrapped in an `<a>` for navigation
 * without invalid nesting.
 *
 * Props are modeled as a discriminated union on `variant` so the type
 * checker prevents nonsense like `<StatusPill variant="plain" accent="coral" />`.
 *
 * Optional props (per variant — see discriminated union below):
 * - `leadingIcon`: React node rendered before children. Auto adds gap-1.5.
 *   Available on `plain` and `accent`. Disallowed on `dot` (the colored
 *   dot is already the leading affordance).
 * - `hoverable`: adds hover:bg-neutral-50 + transition-colors. Use this on
 *   chip links instead of wrapping the anchor in hover:opacity-80, which
 *   cascaded into icons + dots + borders and read as "disabled."
 *   Available on `plain` and `dot`. Disallowed on `accent` (tinted bg
 *   already reads interactive; hover-on-tint looked broken in QA).
 */
import * as React from 'react'
import { cn } from '@/lib/utils'

type AccentColor = 'blue' | 'yellow' | 'coral' | 'neutral'

const dotBgMap: Record<AccentColor, string> = {
  blue: 'bg-blue-500',
  yellow: 'bg-yellow-500',
  coral: 'bg-coral-500',
  neutral: 'bg-neutral-500',
}

const accentBgMap: Record<AccentColor, string> = {
  blue: 'bg-blue-100 text-blue-500',
  yellow: 'bg-yellow-100 text-yellow-500',
  coral: 'bg-coral-100 text-coral-500',
  neutral: 'bg-neutral-50 text-neutral-700',
}

type StatusPillBase = {
  children: React.ReactNode
  className?: string
}

/**
 * Discriminated union tightened in Phase 2.5E.3:
 * - `accent` disallows `hoverable` (visual clash: the tinted bg already
 *   reads as "interactive"; hover-on-tint looked broken in QA).
 * - `dot` disallows `leadingIcon` (visual ambiguity: the colored dot is
 *   already the leading affordance — two indicators on one pill compete).
 */
export type StatusPillProps =
  | (StatusPillBase & {
      variant: 'plain'
      leadingIcon?: React.ReactNode
      hoverable?: boolean
    })
  | (StatusPillBase & {
      variant: 'dot'
      dotColor?: AccentColor
      hoverable?: boolean
      leadingIcon?: never
    })
  | (StatusPillBase & {
      variant: 'accent'
      accent?: AccentColor
      leadingIcon?: React.ReactNode
      hoverable?: never
    })

export function StatusPill(props: StatusPillProps) {
  const { children, className } = props

  if (props.variant === 'accent') {
    const gapClass = props.leadingIcon ? 'gap-1.5' : ''
    return (
      <span
        data-pill
        className={cn(
          'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium',
          accentBgMap[props.accent ?? 'neutral'],
          gapClass,
          className,
        )}
      >
        {props.leadingIcon}
        {children}
      </span>
    )
  }

  if (props.variant === 'dot') {
    const hoverClass = props.hoverable ? 'hover:bg-neutral-50 transition-colors' : ''
    return (
      <span
        data-pill
        className={cn(
          'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white border border-border text-neutral-700',
          hoverClass,
          className,
        )}
      >
        <span
          data-status-dot
          className={cn('w-1.5 h-1.5 rounded-full', dotBgMap[props.dotColor ?? 'neutral'])}
        />
        {children}
      </span>
    )
  }

  const hoverClass = props.hoverable ? 'hover:bg-neutral-50 transition-colors' : ''
  const gapClass = props.leadingIcon ? 'gap-1.5' : ''
  return (
    <span
      data-pill
      className={cn(
        'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-white border border-border text-neutral-700',
        gapClass,
        hoverClass,
        className,
      )}
    >
      {props.leadingIcon}
      {children}
    </span>
  )
}
