'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  submitPreviewReviewAction,
  type SubmitPreviewReviewResult,
} from '@/server/actions/notifications'

/**
 * Sticky bottom-right button on the AM /preview page. When the AM has
 * unresolved post-thread comments authored by them on the batch, clicking
 * fires `submitPreviewReviewAction`, which emits a
 * `preview_review_submitted` ActivityEvent + a Mention on the assigned
 * designer so the bell lights up.
 *
 * Spec: projects/relay-app/2026-05-21-notification-bell-and-heartbeat-plan.md
 *       § Task 15
 *
 * No toast utility exists in the repo yet (no sonner / react-hot-toast).
 * v1 surfaces feedback via the button state itself (Sent ✓) plus a small
 * inline status line. If the user clicks with zero comments to send, the
 * inline status shows "No comments to send." and the button stays
 * disabled. A toast utility can be wired in later without changing the
 * action surface.
 */
export interface PreviewSubmitButtonProps {
  batchId: string
  designerName: string | null
  initialCommentCount: number
}

type Status =
  | { kind: 'idle' }
  | { kind: 'submitted'; count: number }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }

export function PreviewSubmitButton({
  batchId,
  designerName,
  initialCommentCount,
}: PreviewSubmitButtonProps) {
  const [count, setCount] = useState(initialCommentCount)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [isPending, startTransition] = useTransition()

  const submitted = status.kind === 'submitted'
  const disabled = count === 0 || isPending || submitted

  const handleClick = () => {
    if (count === 0) {
      setStatus({ kind: 'empty' })
      return
    }
    const target = designerName ?? 'the designer'
    const noun = count === 1 ? 'comment' : 'comments'
    const ok = window.confirm(`Send ${count} ${noun} to ${target}?`)
    if (!ok) return

    startTransition(async () => {
      try {
        const result: SubmitPreviewReviewResult = await submitPreviewReviewAction({
          batchId,
        })
        if (result.notified) {
          setStatus({ kind: 'submitted', count: result.commentCount ?? count })
          setCount(0)
        } else {
          setStatus({ kind: 'empty' })
          setCount(0)
        }
      } catch (e) {
        setStatus({
          kind: 'error',
          message: e instanceof Error ? e.message : 'Submit failed',
        })
      }
    })
  }

  const label = (() => {
    if (submitted) return 'Sent ✓'
    if (isPending) return 'Sending…'
    if (count === 0) return 'No comments to send'
    return `Submit (${count})`
  })()

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-1.5"
      data-testid="preview-submit-button"
    >
      {status.kind === 'submitted' && (
        <div className="rounded-md bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm border border-border">
          Sent {status.count} {status.count === 1 ? 'comment' : 'comments'} to{' '}
          {designerName ?? 'the designer'}.
        </div>
      )}
      {status.kind === 'empty' && (
        <div className="rounded-md bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm border border-border">
          No comments to send.
        </div>
      )}
      {status.kind === 'error' && (
        <div className="rounded-md bg-destructive/10 px-3 py-1.5 text-xs text-destructive shadow-sm border border-destructive/40">
          {status.message}
        </div>
      )}
      <Button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        variant={submitted ? 'outline' : 'default'}
      >
        {label}
      </Button>
    </div>
  )
}
