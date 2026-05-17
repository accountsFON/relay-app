'use client'

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CaptionEditBottomSheetProps {
  open: boolean
  originalCaption: string
  /** Pre-populated draft if reviewer is re-editing a prior suggestion. */
  initialDraft?: string
  onSave: (newCaption: string) => Promise<void> | void
  onCancel: () => void
  className?: string
}

/**
 * Full-screen, mobile-first bottom sheet used by the v2 client review surface
 * when a reviewer taps Edit Copy on a post.
 *
 * Behavior:
 * - Backdrop click, Cancel button, and Escape key all call onCancel.
 * - Save button (or Cmd/Ctrl+Enter) calls onSave with the current draft.
 * - Save is disabled while the draft is unchanged from the original caption.
 * - Original caption is hidden behind a collapsed disclosure by default.
 *
 * Mobile/iOS keyboard handling:
 * - Sheet uses height: 100dvh so the viewport shrinks with the on-screen
 *   keyboard.
 * - When the VirtualKeyboard API is supported we set overlaysContent so the
 *   keyboard inset is exposed via env(keyboard-inset-height); we add that as
 *   bottom padding on the textarea wrapper so the caret never disappears.
 * - On open, the textarea is focused and scrolled into view (block: 'center').
 *
 * Accessibility:
 * - role="dialog", aria-modal="true", aria-labelledby on the title.
 * - Tab/Shift+Tab cycle within the sheet (simple focus trap).
 * - Returns focus to the previously-focused element on close.
 * - Cancel + Save buttons meet a 44pt minimum touch target.
 */
export function CaptionEditBottomSheet({
  open,
  originalCaption,
  initialDraft,
  onSave,
  onCancel,
  className,
}: CaptionEditBottomSheetProps) {
  const titleId = useId()
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  const [draft, setDraft] = useState<string>(initialDraft ?? originalCaption)
  const [originalExpanded, setOriginalExpanded] = useState(false)
  const [saving, setSaving] = useState(false)

  // When the sheet opens or the inputs change, reset draft + collapsed state.
  useEffect(() => {
    if (open) {
      setDraft(initialDraft ?? originalCaption)
      setOriginalExpanded(false)
      setSaving(false)
    }
  }, [open, initialDraft, originalCaption])

  // Auto-focus + scroll into view on open. Remember the prior focus target so
  // we can restore it on close.
  useEffect(() => {
    if (!open) return
    previouslyFocusedRef.current =
      (document.activeElement as HTMLElement | null) ?? null

    // Defer one frame so the sheet is in the DOM before we focus.
    const raf = requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (ta) {
        ta.focus()
        try {
          ta.scrollIntoView({ block: 'center' })
        } catch {
          // jsdom + older browsers may not implement scrollIntoView options.
        }
      }
    })

    return () => {
      cancelAnimationFrame(raf)
      const prev = previouslyFocusedRef.current
      if (prev && typeof prev.focus === 'function') {
        try {
          prev.focus()
        } catch {
          // no-op
        }
      }
    }
  }, [open])

  // Opt into the VirtualKeyboard API so we can use env(keyboard-inset-height).
  useEffect(() => {
    if (!open) return
    if (typeof navigator === 'undefined') return
    const nav = navigator as Navigator & {
      virtualKeyboard?: { overlaysContent: boolean }
    }
    if (!nav.virtualKeyboard) return
    const previous = nav.virtualKeyboard.overlaysContent
    nav.virtualKeyboard.overlaysContent = true
    return () => {
      nav.virtualKeyboard!.overlaysContent = previous
    }
  }, [open])

  // Body scroll lock while the sheet is open.
  useEffect(() => {
    if (!open) return
    if (typeof document === 'undefined') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const isDirty = draft !== originalCaption
  const canSave = isDirty && !saving

  const handleSave = useCallback(async () => {
    if (!canSave) return
    setSaving(true)
    try {
      await onSave(draft)
    } finally {
      setSaving(false)
    }
  }, [canSave, draft, onSave])

  const handleBackdropMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    // Only fire when the backdrop itself is the target (not bubbled clicks
    // from inside the sheet).
    if (e.target === e.currentTarget) {
      onCancel()
    }
  }

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
      return
    }

    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void handleSave()
      return
    }

    if (e.key === 'Tab') {
      const root = sheetRef.current
      if (!root) return
      const focusables = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null

      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  if (!open) return null

  return (
    <div
      data-testid="caption-edit-backdrop"
      onMouseDown={handleBackdropMouseDown}
      className="fixed inset-0 z-50 bg-black/50"
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="caption-edit-sheet"
        onKeyDown={handleKeyDown}
        className={cn(
          'fixed inset-x-0 bottom-0 flex w-full flex-col bg-white shadow-xl',
          // Full viewport on mobile (dvh shrinks with the on-screen keyboard).
          'h-[100dvh]',
          className,
        )}
        style={{
          // env(keyboard-inset-height) is exposed when virtualKeyboard
          // overlaysContent = true. Falls back to 0 when unsupported.
          paddingBottom: 'env(keyboard-inset-height, 0px)',
        }}
      >
        {/* Sticky header */}
        <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-neutral-200 bg-white px-3 py-2">
          <button
            type="button"
            onClick={onCancel}
            data-testid="caption-edit-cancel"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            Cancel
          </button>
          <h2
            id={titleId}
            className="flex-1 truncate text-center text-sm font-semibold text-neutral-900"
          >
            Suggest edit
          </h2>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canSave}
            data-testid="caption-edit-save"
            className={cn(
              'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md px-3 text-sm font-semibold transition-colors',
              canSave
                ? 'bg-sky-600 text-white hover:bg-sky-700'
                : 'cursor-not-allowed bg-neutral-200 text-neutral-500',
            )}
          >
            Save Edit
          </button>
        </header>

        {/* Original disclosure (collapsed by default) */}
        <div className="border-b border-neutral-200 bg-neutral-50 px-3 py-2">
          <button
            type="button"
            onClick={() => setOriginalExpanded((v) => !v)}
            aria-expanded={originalExpanded}
            aria-controls={`${titleId}-original`}
            data-testid="caption-edit-original-toggle"
            className="inline-flex items-center gap-1 text-xs font-medium text-neutral-600 hover:text-neutral-900"
          >
            {originalExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            )}
            Original
          </button>
          {originalExpanded ? (
            <div
              id={`${titleId}-original`}
              data-testid="caption-edit-original-body"
              className="mt-2 whitespace-pre-wrap rounded-md bg-white p-2 text-sm text-neutral-600"
            >
              {originalCaption}
            </div>
          ) : null}
        </div>

        {/* Textarea fills remaining space */}
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <label htmlFor={`${titleId}-textarea`} className="sr-only">
            Suggested caption
          </label>
          <textarea
            ref={textareaRef}
            id={`${titleId}-textarea`}
            data-testid="caption-edit-textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-full min-h-0 w-full flex-1 resize-none rounded-md border border-neutral-300 bg-white p-3 text-sm text-neutral-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            placeholder="Write your suggested caption..."
          />
        </div>
      </div>
    </div>
  )
}

export default CaptionEditBottomSheet
