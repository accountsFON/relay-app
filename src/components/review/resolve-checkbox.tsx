'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ResolveCheckboxProps {
  label: string
  /** Optional author byline shown above the label (who created the pin). */
  byline?: string
  resolved: boolean
  onResolve: () => Promise<void>
  onUnresolve: () => Promise<void>
  disabled?: boolean
  testId?: string
  /**
   * When set, the comment content (byline + label) becomes its own button that
   * fires this — used by the review rail to open the pin on the canvas. It's a
   * SIBLING of the resolve checkbox (not a wrapper), so resolving and opening
   * are two independent, individually keyboard-accessible controls with no
   * nested-interactive or event-bubbling cross-fire.
   */
  onSelect?: () => void
}

/**
 * Optimistic resolve tick used in the review rails' resolve checklist. Matches
 * the checklist-panel visual. Flips local state immediately, fires the injected
 * action, rolls back on error. `resolved` prop is authoritative via a
 * render-time signature reconcile.
 */
export function ResolveCheckbox({
  label,
  byline,
  resolved,
  onResolve,
  onUnresolve,
  disabled,
  testId,
  onSelect,
}: ResolveCheckboxProps) {
  const [checked, setChecked] = useState(resolved)
  const [seeded, setSeeded] = useState(resolved)
  if (resolved !== seeded) {
    setChecked(resolved)
    setSeeded(resolved)
  }

  function toggle() {
    if (disabled) return
    const next = !checked
    setChecked(next)
    const action = next ? onResolve : onUnresolve
    void action().catch(() => setChecked(!next))
  }

  const content = (
    <>
      {byline && (
        <span
          data-testid={testId ? `${testId}-byline` : undefined}
          className="text-[12px] font-semibold break-words text-muted-foreground"
        >
          {byline}
        </span>
      )}
      <span
        data-testid={testId ? `${testId}-label` : undefined}
        className={cn(
          'text-[13px] leading-tight break-words',
          checked ? 'text-muted-foreground line-through' : 'text-foreground',
        )}
      >
        {label}
      </span>
    </>
  )

  return (
    <div className="flex items-start gap-2">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={checked ? 'Mark unresolved' : 'Mark resolved'}
        onClick={toggle}
        disabled={disabled}
        data-testid={testId}
        className={cn(
          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border',
          checked
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-background',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        {checked && <Check className="size-3" />}
      </button>
      {onSelect ? (
        // Sibling of the checkbox (not a wrapper) — clicking the comment opens
        // its pin; the checkbox next to it still resolves independently.
        <button
          type="button"
          onClick={onSelect}
          aria-label={`Open pin: ${label}`}
          className="flex min-w-0 flex-1 flex-col rounded-md text-left hover:bg-neutral-50"
        >
          {content}
        </button>
      ) : (
        <span className="flex min-w-0 flex-col">{content}</span>
      )}
    </div>
  )
}
