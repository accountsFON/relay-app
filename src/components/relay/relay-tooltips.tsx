'use client'

/**
 * Tiny semantic wrappers around the shared Tooltip primitive for the two
 * concepts that appear all over the relay surfaces: a step pill and a role
 * chip. Centralizing these here keeps copy consistent and lets us avoid
 * per-surface tooltip wrappers.
 *
 * Copy rules (Wave 4K):
 *  - No em or en dashes anywhere.
 *  - No compound hyphens in body copy.
 *  - Keep each line under 80 characters.
 */

import type { ReactElement, ReactNode } from 'react'
import { RelayRole, RelayStep } from '@prisma/client'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  RELAY_STEP_DESCRIPTIONS,
  RELAY_STEP_LABELS,
  relayStepDescription,
} from '@/lib/relay-step-labels'

export const RELAY_ROLE_DESCRIPTIONS: Record<RelayRole, string> = {
  [RelayRole.admin]: 'Workspace admin, full access',
  [RelayRole.am]: 'Account Manager, owns the relationship and the relay handoff',
  [RelayRole.designer]: 'Owns visuals and design revisions',
  [RelayRole.client]: 'End client, approves the relay and the posts',
}

export function relayRoleDescription(role: RelayRole | string | null | undefined): string {
  if (role == null) return ''
  if (typeof role === 'string' && role in RELAY_ROLE_DESCRIPTIONS) {
    return RELAY_ROLE_DESCRIPTIONS[role as RelayRole]
  }
  return ''
}

interface SimpleTooltipProps {
  /** The element that opens the tooltip on hover or focus. Must render a focusable node. */
  children: ReactElement
  /** Plain text body of the tooltip. */
  content: ReactNode
  /** Side preference, defaults to top to avoid covering the trigger. */
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** Skip rendering when there is nothing meaningful to say. */
  disabled?: boolean
}

/**
 * Wraps a single focusable element in the shared Tooltip primitive. The
 * trigger uses base UI's `render` prop so we don't add an extra wrapper
 * button around already-interactive children.
 */
export function SimpleTooltip({
  children,
  content,
  side = 'top',
  disabled = false,
}: SimpleTooltipProps) {
  if (disabled || content == null || content === '') {
    return children
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={children} />
        <TooltipContent side={side}>{content}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

interface StepTooltipProps {
  step: RelayStep | string | null | undefined
  children: ReactElement
  side?: 'top' | 'right' | 'bottom' | 'left'
}

/**
 * StepTooltip explains what a relay step actually means. Used on station
 * pills, kanban tile step labels, and relay track nodes.
 */
export function StepTooltip({ step, children, side = 'top' }: StepTooltipProps) {
  const description = relayStepDescription(step)
  if (!description) return children
  const label =
    step != null && typeof step === 'string' && step in RELAY_STEP_LABELS
      ? RELAY_STEP_LABELS[step as RelayStep]
      : null
  return (
    <SimpleTooltip
      side={side}
      content={
        <span className="flex flex-col gap-0.5">
          {label && (
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em]">
              {label}
            </span>
          )}
          <span>{description}</span>
        </span>
      }
    >
      {children}
    </SimpleTooltip>
  )
}

interface RoleTooltipProps {
  role: RelayRole | string | null | undefined
  children: ReactElement
  side?: 'top' | 'right' | 'bottom' | 'left'
}

/**
 * RoleTooltip explains what an AM, Designer, Client, or Admin chip means.
 */
export function RoleTooltip({ role, children, side = 'top' }: RoleTooltipProps) {
  const description = relayRoleDescription(role as RelayRole)
  if (!description) return children
  return (
    <SimpleTooltip side={side} content={description}>
      {children}
    </SimpleTooltip>
  )
}

/** Re-export so callers don't have to know where the constant lives. */
export { RELAY_STEP_DESCRIPTIONS }
