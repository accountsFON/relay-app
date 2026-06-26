'use client'

import {
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { cn } from '@/lib/utils'
import type { MentionTarget } from '@/lib/mentions'

/**
 * Shared @-mention autocomplete behavior for plain-textarea composers.
 *
 * Mirrors the activity CommentComposer UX (type `@` to open a roster dropdown
 * filtered by the typed prefix; Arrow keys move, Enter/Tab inserts, Escape
 * closes) but factored out so the preview pin composers (PinDraftComposer,
 * CommentThread) can reuse it without depending on postCommentAction.
 *
 * Additive + defaulted: when `roster` is empty the hook is inert — no dropdown,
 * no key interception — so the client `/review/[token]` path (which passes no
 * roster) behaves exactly as before.
 *
 * The host owns the textarea value + ref. On every change the host calls
 * `onBodyChange(value)`; the hook recomputes the active query from the caret.
 */
export interface UseMentionAutocomplete {
  /** Recompute the dropdown state from the textarea after a value change. */
  onBodyChange: (value: string) => void
  /**
   * Keydown handler to wire onto the textarea. Returns true when it consumed
   * the event (navigated/inserted/closed) so the host can skip its own submit
   * shortcut for that key.
   */
  handleKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => boolean
  /** The dropdown element (null when nothing is open). Render inside the form. */
  dropdown: ReactNode
  /** True while the dropdown is open with at least one match. */
  isOpen: boolean
}

export function useMentionAutocomplete(opts: {
  roster: MentionTarget[]
  textareaRef: RefObject<HTMLTextAreaElement | null>
  body: string
  setBody: (next: string) => void
}): UseMentionAutocomplete {
  const { roster, textareaRef, body, setBody } = opts
  const [activeQuery, setActiveQuery] = useState<string | null>(null)
  const [highlightIndex, setHighlightIndex] = useState(0)

  const filtered = useMemo(() => {
    if (activeQuery === null || roster.length === 0) return []
    const q = activeQuery.toLowerCase()
    if (!q) return roster.slice(0, 6)
    return roster
      .filter((m) => m.handle.startsWith(q) || m.name.toLowerCase().includes(q))
      .slice(0, 6)
  }, [activeQuery, roster])

  const isOpen = activeQuery !== null && filtered.length > 0

  function detectMentionAtCaret(textarea: HTMLTextAreaElement): {
    start: number
    end: number
    query: string
  } | null {
    const caret = textarea.selectionStart ?? 0
    const upToCaret = textarea.value.slice(0, caret)
    const atIndex = upToCaret.lastIndexOf('@')
    if (atIndex < 0) return null
    if (atIndex > 0 && /[a-z0-9]/i.test(upToCaret[atIndex - 1] ?? '')) return null
    const segment = upToCaret.slice(atIndex + 1)
    if (/\s/.test(segment)) return null
    return { start: atIndex, end: caret, query: segment }
  }

  function onBodyChange() {
    if (roster.length === 0) return
    const ta = textareaRef.current
    if (!ta) return
    const m = detectMentionAtCaret(ta)
    if (m) {
      setActiveQuery(m.query)
      setHighlightIndex(0)
    } else {
      setActiveQuery(null)
    }
  }

  function insertHandle(handle: string) {
    const ta = textareaRef.current
    if (!ta) return
    const m = detectMentionAtCaret(ta)
    if (!m) return
    const before = body.slice(0, m.start)
    const after = body.slice(m.end)
    const next = `${before}@${handle} ${after}`
    setBody(next)
    setActiveQuery(null)
    const newCaret = m.start + handle.length + 2
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(newCaret, newCaret)
    })
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>): boolean {
    if (activeQuery === null || filtered.length === 0) return false
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightIndex((i) => (i + 1) % filtered.length)
      return true
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightIndex((i) => (i - 1 + filtered.length) % filtered.length)
      return true
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      const target = filtered[highlightIndex]
      if (target) {
        event.preventDefault()
        insertHandle(target.handle)
        return true
      }
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setActiveQuery(null)
      return true
    }
    return false
  }

  const dropdown = isOpen ? (
    <ul
      role="listbox"
      aria-label="Mention suggestions"
      className="absolute bottom-full left-0 mb-1 z-10 w-72 max-w-[calc(100%-1rem)] overflow-hidden rounded-xl border border-[#dbdbdb] bg-white shadow-lg"
    >
      {filtered.map((target, i) => {
        const isHighlighted = i === highlightIndex
        return (
          <li key={target.id}>
            <button
              type="button"
              role="option"
              aria-selected={isHighlighted}
              onMouseDown={(e) => {
                e.preventDefault()
                insertHandle(target.handle)
              }}
              onMouseEnter={() => setHighlightIndex(i)}
              className={cn(
                'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] transition-colors',
                isHighlighted ? 'bg-neutral-100' : 'bg-white hover:bg-neutral-200',
              )}
            >
              <span className="truncate font-medium text-[#262626]">{target.name}</span>
              <span className="shrink-0 text-[11px] text-[#8e8e8e]">@{target.handle}</span>
            </button>
          </li>
        )
      })}
    </ul>
  ) : null

  return {
    onBodyChange: () => onBodyChange(),
    handleKeyDown,
    dropdown,
    isOpen,
  }
}
