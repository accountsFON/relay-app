'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { QA_ONCE_OVER_ITEMS } from '@/lib/relay-final-qa'

export interface FinalQaOnceOverProps {
  /** Keyed by item index. */
  checked: Record<number, boolean>
  onToggle: (index: number, value: boolean) => void
}

/**
 * The ephemeral final-QA once-over checklist (P1 #13). Rendered inside the
 * Design Review → Client Review / Final QA confirm modals on both surfaces.
 * Client-side gate only; ticks are not persisted.
 */
export function FinalQaOnceOver({ checked, onToggle }: FinalQaOnceOverProps) {
  return (
    <ul data-testid="final-qa-once-over" className="flex flex-col gap-2 py-1">
      {QA_ONCE_OVER_ITEMS.map((label, i) => {
        const isChecked = Boolean(checked[i])
        return (
          <li key={label} className="flex items-start gap-2">
            <button
              type="button"
              role="checkbox"
              aria-checked={isChecked}
              aria-label={label}
              onClick={() => onToggle(i, !isChecked)}
              className={cn(
                'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                isChecked ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
              )}
            >
              {isChecked && <Check className="size-3" />}
            </button>
            <span className={cn('text-[13px]', isChecked ? 'text-muted-foreground line-through' : 'text-foreground')}>
              {label}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** True when every once-over item is checked. */
export function allQaOnceOverChecked(checked: Record<number, boolean>): boolean {
  return QA_ONCE_OVER_ITEMS.every((_, i) => checked[i])
}
