'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { cn } from '@/lib/utils'
import { useUnsavedChanges } from '@/lib/unsaved-changes'

/**
 * Inline composer that pops up when a user drops a new pin (image click or
 * caption text selection). Replaces the previous `window.prompt` shortcut
 * with a styled card that mirrors the look of PinPopover, supports
 * Cmd/Ctrl+Enter to submit, Escape to cancel, and click outside to cancel.
 *
 * Pure presentational. Position math mirrors PinPopover's flip logic so the
 * composer stays inside the viewport regardless of click location.
 */

export type PinDraftComposerProps = {
  anchor: { x: number; y: number } | null
  onSubmit: (body: string) => void | Promise<void>
  onCancel: () => void
  className?: string
}

const COMPOSER_WIDTH = 280
const COMPOSER_HEIGHT_ESTIMATE = 150
const VIEWPORT_GUTTER = 8

export function PinDraftComposer({
  anchor,
  onSubmit,
  onCancel,
  className,
}: PinDraftComposerProps) {
  const composerRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number }>(() =>
    computePosition(anchor, COMPOSER_HEIGHT_ESTIMATE),
  )

  useLayoutEffect(() => {
    const el = composerRef.current
    const height = el?.getBoundingClientRect().height ?? COMPOSER_HEIGHT_ESTIMATE
    setPosition(computePosition(anchor, height))
  }, [anchor])

  // Autofocus the textarea when mounted.
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // Warn before navigating away while an unsaved draft exists.
  useUnsavedChanges(body.trim().length > 0)

  // Single cancel guard: a non-empty draft prompts a discard confirmation
  // before the cancel is honored. Mirrors PinPopover's requestClose shape.
  const requestCancel = useCallback(() => {
    if (body.trim().length > 0 && !window.confirm('Discard unsaved changes?'))
      return
    onCancel()
  }, [body, onCancel])

  // Escape closes; document click outside cancels.
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        requestCancel()
      }
    }
    function handlePointer(event: MouseEvent) {
      const el = composerRef.current
      if (!el) return
      if (event.target instanceof Node && el.contains(event.target)) return
      requestCancel()
    }
    window.addEventListener('keydown', handleKey)
    // Use mousedown so the cancel fires before the next click target activates.
    document.addEventListener('mousedown', handlePointer)
    return () => {
      window.removeEventListener('keydown', handleKey)
      document.removeEventListener('mousedown', handlePointer)
    }
  }, [requestCancel])

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    const trimmed = body.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    try {
      await onSubmit(trimmed)
    } finally {
      setSubmitting(false)
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl+Enter submits.
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void handleSubmit()
    }
  }

  const canSubmit = body.trim().length > 0 && !submitting

  return (
    <div
      ref={composerRef}
      role="dialog"
      aria-label="Add a comment"
      data-testid="pin-draft-composer"
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        width: COMPOSER_WIDTH,
        zIndex: 60,
      }}
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-[#dbdbdb] bg-white p-3 text-[13px] text-[#262626] shadow-xl',
        className,
      )}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <textarea
          ref={textareaRef}
          data-testid="pin-draft-composer-input"
          aria-label="Comment body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={submitting}
          rows={3}
          placeholder="Leave a comment..."
          className="resize-none rounded-md border border-[#dbdbdb] bg-white px-2 py-1.5 text-[13px] text-[#262626] outline-none focus:border-[#8e8e8e]"
        />
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            data-testid="pin-draft-composer-cancel"
            onClick={requestCancel}
            className="rounded-md px-2 py-1 text-[12px] font-medium text-[#8e8e8e] hover:bg-[#f5f5f5] hover:text-[#262626]"
          >
            Cancel
          </button>
          <button
            type="submit"
            data-testid="pin-draft-composer-submit"
            disabled={!canSubmit}
            className={cn(
              'rounded-md px-3 py-1 text-[12px] font-semibold',
              canSubmit
                ? 'bg-[#262626] text-white hover:bg-black'
                : 'cursor-not-allowed bg-[#dbdbdb] text-[#8e8e8e]',
            )}
          >
            {submitting ? 'Sending...' : 'Comment'}
          </button>
        </div>
      </form>
    </div>
  )
}

function computePosition(
  anchor: { x: number; y: number } | null,
  height: number,
): { top: number; left: number } {
  const viewportWidth =
    typeof window !== 'undefined' ? window.innerWidth : 1024
  const viewportHeight =
    typeof window !== 'undefined' ? window.innerHeight : 768

  if (!anchor) {
    return {
      top: Math.max(VIEWPORT_GUTTER, (viewportHeight - height) / 2),
      left: Math.max(VIEWPORT_GUTTER, (viewportWidth - COMPOSER_WIDTH) / 2),
    }
  }

  let left = anchor.x + 12
  let top = anchor.y + 12

  if (left + COMPOSER_WIDTH + VIEWPORT_GUTTER > viewportWidth) {
    left = anchor.x - COMPOSER_WIDTH - 12
  }
  if (top + height + VIEWPORT_GUTTER > viewportHeight) {
    top = anchor.y - height - 12
  }

  left = clamp(
    left,
    VIEWPORT_GUTTER,
    Math.max(VIEWPORT_GUTTER, viewportWidth - COMPOSER_WIDTH - VIEWPORT_GUTTER),
  )
  top = clamp(
    top,
    VIEWPORT_GUTTER,
    Math.max(VIEWPORT_GUTTER, viewportHeight - height - VIEWPORT_GUTTER),
  )

  return { top, left }
}

function clamp(n: number, min: number, max: number): number {
  if (n < min) return min
  if (n > max) return max
  return n
}
