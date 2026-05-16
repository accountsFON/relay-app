'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { diffText, type DiffSegment } from '@/lib/text-diff'

/**
 * Diff modal for the Fix with AI flow.
 *
 * Renders the proposed caption as colored segments , red strike-through for
 * deletes, green for inserts, default for unchanged. AM can toggle into Edit
 * mode to tweak the proposal in an inline textarea before committing, which
 * re-renders the diff against the latest edited text on accept.
 *
 * Actions:
 *   - Accept: POST /api/posts/[postId]/fix-with-ai/accept with the current
 *     (possibly edited) caption. On 2xx, calls onAccepted then onClose.
 *   - Reject: closes the modal without any API call.
 *
 * Spec: design doc § Fix with AI; plan Task 3.1.
 */

export type DiffModalProps = {
  postId: string
  threadId: string
  /** Original caption, only used to recompute the diff after AM edits. */
  originalCaption?: string
  proposedCaption: string
  diff: DiffSegment[]
  tokenUsage?: { in: number; out: number; costUsd: number }
  onAccepted?: () => void
  onClose?: () => void
}

export function DiffModal({
  postId,
  threadId,
  originalCaption,
  proposedCaption,
  diff,
  tokenUsage,
  onAccepted,
  onClose,
}: DiffModalProps) {
  const [editing, setEditing] = useState(false)
  const [editedCaption, setEditedCaption] = useState(proposedCaption)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Escape closes the modal (unless we're submitting).
  useEffect(() => {
    function handle(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) {
        onClose?.()
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [onClose, submitting])

  // When the user toggles into edit mode, focus the textarea and seed the
  // caret at the end so they can keep typing immediately.
  useEffect(() => {
    if (editing && textareaRef.current) {
      const el = textareaRef.current
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
  }, [editing])

  // If the AM edits the proposal, recompute the diff so the preview reflects
  // their tweaks. Falls back to the server diff when not editing.
  const liveDiff: DiffSegment[] =
    editing && originalCaption !== undefined
      ? diffText(originalCaption, editedCaption)
      : diff

  async function handleAccept() {
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/posts/${postId}/fix-with-ai/accept`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          threadId,
          proposedCaption: editedCaption,
        }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        setError(text || `Accept failed (${res.status})`)
        return
      }
      onAccepted?.()
      onClose?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Accept failed')
    } finally {
      setSubmitting(false)
    }
  }

  function handleReject() {
    if (submitting) return
    onClose?.()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Fix with AI proposal"
      data-testid="diff-modal"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) {
          onClose?.()
        }
      }}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            Fix with AI
          </h2>
          {tokenUsage ? (
            <span
              data-testid="diff-modal-cost"
              className="text-[11px] text-muted-foreground"
            >
              {tokenUsage.in.toLocaleString()} in /{' '}
              {tokenUsage.out.toLocaleString()} out · $
              {tokenUsage.costUsd.toFixed(4)}
            </span>
          ) : null}
        </header>

        <div
          data-testid="diff-modal-diff"
          className="max-h-[40vh] overflow-y-auto rounded-md border border-border bg-background p-3 font-sans text-[14px] leading-relaxed text-foreground"
        >
          {liveDiff.length === 0 ? (
            <span className="text-muted-foreground">No changes proposed.</span>
          ) : (
            liveDiff.map((segment, idx) => (
              <DiffSegmentSpan key={idx} segment={segment} />
            ))
          )}
        </div>

        {editing ? (
          <textarea
            ref={textareaRef}
            data-testid="diff-modal-editor"
            aria-label="Edit proposed caption"
            value={editedCaption}
            onChange={(event) => setEditedCaption(event.target.value)}
            disabled={submitting}
            rows={6}
            className="resize-y rounded-md border border-border bg-background px-3 py-2 text-[14px] leading-relaxed text-foreground outline-none focus:border-ring"
          />
        ) : null}

        {error ? (
          <p
            role="alert"
            data-testid="diff-modal-error"
            className="text-[12px] text-destructive"
          >
            {error}
          </p>
        ) : null}

        <footer className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="diff-modal-reject"
            onClick={handleReject}
            disabled={submitting}
          >
            Reject
          </Button>
          {editing ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="diff-modal-edit-done"
              onClick={() => setEditing(false)}
              disabled={submitting}
            >
              Done editing
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="diff-modal-edit"
              onClick={() => setEditing(true)}
              disabled={submitting}
            >
              Edit
            </Button>
          )}
          <Button
            type="button"
            variant="default"
            size="sm"
            data-testid="diff-modal-accept"
            onClick={handleAccept}
            disabled={submitting}
          >
            {submitting ? 'Saving...' : 'Accept'}
          </Button>
        </footer>
      </div>
    </div>
  )
}

function DiffSegmentSpan({ segment }: { segment: DiffSegment }) {
  const className =
    segment.type === 'insert'
      ? 'bg-emerald-100 text-emerald-900'
      : segment.type === 'delete'
        ? 'bg-rose-100 text-rose-900 line-through'
        : ''
  return (
    <span
      data-testid={`diff-modal-segment-${segment.type}`}
      data-segment-type={segment.type}
      className={cn('whitespace-pre-wrap', className)}
    >
      {segment.text}
    </span>
  )
}
