/**
 * CommentComposer: textarea + @mention autocomplete.
 *
 * Spec: projects/relay-app/2026-05-09-activity-thread-plan.md § CommentComposer
 *       projects/relay-app/2026-05-09-relay-workflow-design.md § Phase 2
 *
 * Behavior:
 * - Type `@` to open the autocomplete dropdown filtered by the typed prefix.
 * - Click a suggestion or hit Enter/Tab to insert the handle at the caret.
 * - Submit via the Send button or ⌘↵ / Ctrl+↵.
 * - On submit, calls postCommentAction. Errors surface inline.
 */
'use client'

import { useState, useRef, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { postCommentAction } from '@/app/(app)/clients/[id]/activity/actions'
import type { MentionTarget } from '@/lib/mentions'

export interface CommentComposerProps {
  clientId: string
  mentionTargets?: MentionTarget[]
  className?: string
}

export function CommentComposer({
  clientId,
  mentionTargets = [],
  className,
}: CommentComposerProps) {
  const [body, setBody] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const router = useRouter()

  const [activeQuery, setActiveQuery] = useState<string | null>(null)
  const [highlightIndex, setHighlightIndex] = useState(0)

  const filteredTargets = useMemo(() => {
    if (activeQuery === null) return []
    const q = activeQuery.toLowerCase()
    if (!q) return mentionTargets.slice(0, 6)
    return mentionTargets
      .filter(
        (m) => m.handle.startsWith(q) || m.name.toLowerCase().includes(q),
      )
      .slice(0, 6)
  }, [activeQuery, mentionTargets])

  const canSubmit = body.trim().length > 0 && !isPending

  function submit() {
    if (!canSubmit) return
    setError(null)
    startTransition(async () => {
      try {
        await postCommentAction({ clientId, body })
        setBody('')
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to post comment')
      }
    })
  }

  function detectMentionAtCaret(textarea: HTMLTextAreaElement): {
    start: number
    end: number
    query: string
  } | null {
    const caret = textarea.selectionStart ?? 0
    const upToCaret = textarea.value.slice(0, caret)
    const atIndex = upToCaret.lastIndexOf('@')
    if (atIndex < 0) return null
    if (atIndex > 0 && /[a-z0-9]/i.test(upToCaret[atIndex - 1] ?? '')) {
      return null
    }
    const segment = upToCaret.slice(atIndex + 1)
    if (/\s/.test(segment)) return null
    return { start: atIndex, end: caret, query: segment }
  }

  function onChange(value: string) {
    setBody(value)
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

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className={cn(
        'relative flex flex-col gap-2 rounded-md border border-border bg-background p-2',
        className,
      )}
      data-component="comment-composer"
    >
      <Textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type a message... @ to mention"
        rows={2}
        className="resize-none border-0 focus-visible:ring-0 shadow-none p-2"
        onKeyDown={(e) => {
          if (activeQuery !== null && filteredTargets.length > 0) {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setHighlightIndex((i) => (i + 1) % filteredTargets.length)
              return
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setHighlightIndex(
                (i) => (i - 1 + filteredTargets.length) % filteredTargets.length,
              )
              return
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              const target = filteredTargets[highlightIndex]
              if (target) {
                e.preventDefault()
                insertHandle(target.handle)
                return
              }
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              setActiveQuery(null)
              return
            }
          }
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
        }}
      />

      {activeQuery !== null && filteredTargets.length > 0 && (
        <ul
          role="listbox"
          aria-label="Mention suggestions"
          className="absolute bottom-full left-2 mb-1 w-72 max-w-[calc(100%-1rem)] overflow-hidden rounded-xl bg-popover shadow-md ring-1 ring-foreground/10"
        >
          {filteredTargets.map((target, i) => {
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
                    isHighlighted ? 'bg-neutral-100' : 'bg-popover hover:bg-neutral-200',
                  )}
                >
                  <span className="truncate font-medium text-foreground">
                    {target.name}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    @{target.handle}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          ⌘↵ to send · @ to mention
        </p>
        <div className="flex items-center gap-2">
          {error && <span className="text-[11px] text-destructive">{error}</span>}
          <Button type="submit" size="xs" disabled={!canSubmit}>
            <Send />
            {isPending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </div>
    </form>
  )
}
