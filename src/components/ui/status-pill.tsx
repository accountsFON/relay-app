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
 * Optional props (any variant):
 * - `leadingIcon`: React node rendered before children. Auto adds gap-1.5.
 * - `hoverable`: adds hover:bg-neutral-50 + transition-colors. Use this on
 *   chip links instead of wrapping the anchor in hover:opacity-80, which
 *   cascaded into icons + dots + borders and read as "disabled."
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
  leadingIcon?: React.ReactNode
  hoverable?: boolean
  className?: string
}

export type StatusPillProps =
  | (StatusPillBase & { variant: 'plain' })
  | (StatusPillBase & { variant: 'dot'; dotColor?: AccentColor })
  | (StatusPillBase & { variant: 'accent'; accent?: AccentColor })

export function StatusPill(props: StatusPillProps) {
  const { children, leadingIcon, hoverable, className } = props
  const hoverClass = hoverable ? 'hover:bg-neutral-50 transition-colors' : ''
  const gapClass = leadingIcon ? 'gap-1.5' : ''

  if (props.variant === 'accent') {
    return (
      <span
        data-pill
        className={cn(
          'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium',
          accentBgMap[props.accent ?? 'neutral'],
          gapClass,
          hoverClass,
          className,
        )}
      >
        {leadingIcon}
        {children}
      </span>
    )
  }

  if (props.variant === 'dot') {
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
        {leadingIcon}
        {children}
      </span>
    )
  }

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
      {leadingIcon}
      {children}
    </span>
  )
}
