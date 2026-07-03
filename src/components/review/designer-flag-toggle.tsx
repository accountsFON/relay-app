'use client'

import { useState } from 'react'
import { Flag, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface DesignerFlagToggleProps {
  /** The existing flag on this item, or null when the item is not flagged. */
  flag: { id: string; note: string | null } | null
  /** Create-or-update the flag (idempotent server action). Note is optional. */
  onFlag: (note?: string) => Promise<void>
  /** Remove the flag by id. */
  onUnflag: (flagId: string) => Promise<void>
  disabled?: boolean
  testId?: string
}

function sig(flag: DesignerFlagToggleProps['flag']): string {
  return flag ? `${flag.id}|${flag.note ?? ''}` : 'null'
}

/**
 * AM-side control that routes a piece of client feedback to the designer.
 * Optimistic like ResolveCheckbox: flips local state immediately, fires the
 * injected action, rolls back on error, and reconciles when the `flag` prop
 * changes across renders. When flagged it exposes a one line note that saves
 * on blur (only when it actually changed).
 */
export function DesignerFlagToggle({
  flag,
  onFlag,
  onUnflag,
  disabled,
  testId,
}: DesignerFlagToggleProps) {
  const [flagged, setFlagged] = useState(flag !== null)
  const [note, setNote] = useState(flag?.note ?? '')
  const [seeded, setSeeded] = useState(sig(flag))

  const currentSig = sig(flag)
  if (currentSig !== seeded) {
    setFlagged(flag !== null)
    setNote(flag?.note ?? '')
    setSeeded(currentSig)
  }

  function handleFlag() {
    if (disabled) return
    setFlagged(true)
    void onFlag().catch(() => setFlagged(false))
  }

  function handleUnflag() {
    if (disabled) return
    setFlagged(false)
    if (flag) void onUnflag(flag.id).catch(() => setFlagged(true))
  }

  function handleNoteBlur() {
    const original = flag?.note ?? ''
    if (note !== original) void onFlag(note)
  }

  if (!flagged) {
    return (
      <button
        type="button"
        data-testid={testId ? `${testId}-flag` : undefined}
        onClick={handleFlag}
        disabled={disabled}
        className={cn(
          'inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        <Flag className="size-3" />
        Flag for designer
      </button>
    )
  }

  return (
    <div
      data-testid={testId}
      className="flex flex-col gap-1 rounded-md border border-amber-300 bg-amber-50 p-2"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800">
          <Flag className="size-3 fill-amber-500 text-amber-600" />
          Flagged for designer
        </span>
        <button
          type="button"
          data-testid={testId ? `${testId}-unflag` : undefined}
          onClick={handleUnflag}
          disabled={disabled}
          aria-label="Remove designer flag"
          className="inline-flex items-center gap-0.5 rounded text-[11px] font-medium text-amber-700 hover:text-amber-900 disabled:opacity-60"
        >
          <X className="size-3" />
          Unflag
        </button>
      </div>
      <input
        type="text"
        data-testid={testId ? `${testId}-note` : undefined}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={handleNoteBlur}
        disabled={disabled}
        placeholder="Note for the designer (optional)"
        className="w-full rounded border border-amber-300 bg-white px-2 py-1 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-amber-400 disabled:opacity-60"
      />
    </div>
  )
}
