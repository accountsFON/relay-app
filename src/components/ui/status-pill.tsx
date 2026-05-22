/**
 * StatusPill — surface-level status / metadata pill primitive.
 *
 * Spec: projects/relay-app/2026-05-22-brand-implementation-plan.md
 *       § Task 2.5C.2 (Mockup 3 status pills).
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

export type StatusPillProps = {
  variant: 'plain' | 'dot' | 'accent'
  children: React.ReactNode
  dotColor?: AccentColor
  accent?: AccentColor
  className?: string
}

export function StatusPill({
  variant,
  children,
  dotColor = 'neutral',
  accent = 'neutral',
  className,
}: StatusPillProps) {
  if (variant === 'accent') {
    return (
      <span
        className={cn(
          'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium',
          accentBgMap[accent],
          className,
        )}
      >
        {children}
      </span>
    )
  }
  if (variant === 'dot') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white border border-border text-neutral-700',
          className,
        )}
      >
        <span
          data-status-dot
          className={cn('w-1.5 h-1.5 rounded-full', dotBgMap[dotColor])}
        />
        {children}
      </span>
    )
  }
  return (
    <span
      className={cn(
        'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-white border border-border text-neutral-700',
        className,
      )}
    >
      {children}
    </span>
  )
}
