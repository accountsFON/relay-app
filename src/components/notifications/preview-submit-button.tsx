'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { submitPreviewReviewAction } from '@/server/actions/notifications'
import type { SubmitPreviewReviewResult } from '@/server/services/preview-review-emit'

/**
 * Sticky bottom-right button on the AM /preview page. When the AM has
 * unresolved post-thread comments authored by them on the batch, clicking
 * opens a confirmation Dialog. On confirm, `submitPreviewReviewAction`
 * emits a `preview_review_submitted` ActivityEvent + a Mention on the
 * assigned designer so the bell lights up. Success/error feedback lives
 * in a sonner toast, mounted globally from app-shell.
 *
 * Spec: projects/relay-app/2026-05-21-notification-bell-and-heartbeat-plan.md
 *       § Task 15
 */
export interface PreviewSubmitButtonProps {
  batchId: string
  designerName: string | null
  initialCommentCount: number
}

export function PreviewSubmitButton({
  batchId,
  designerName,
  initialCommentCount,
}: PreviewSubmitButtonProps) {
  const [count, setCount] = useState(initialCommentCount)
  const [submitted, setSubmitted] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const disabled = count === 0 || isPending || submitted
  const target = designerName ?? 'the designer'
  const noun = count === 1 ? 'comment' : 'comments'

  const handleConfirm = () => {
    setDialogOpen(false)
    startTransition(async () => {
      try {
        const result: SubmitPreviewReviewResult = await submitPreviewReviewAction({
          batchId,
        })
        if (result.notified) {
          const finalCount = result.commentCount ?? count
          const finalNoun = finalCount === 1 ? 'comment' : 'comments'
          setSubmitted(true)
          setCount(0)
          toast.success(
            `Sent ${finalCount} ${finalNoun} to ${target}.`,
          )
        } else {
          setCount(0)
          toast.info('No comments to send.')
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Submit failed')
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
    <>
      <div
        className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-1.5"
        data-testid="preview-submit-button"
      >
        <Button
          type="button"
          onClick={() => setDialogOpen(true)}
          disabled={disabled}
          variant={submitted ? 'outline' : 'default'}
          className={
            submitted
              ? 'border-coral-500 text-coral-500 hover:bg-coral-100 hover:text-coral-500'
              : undefined
          }
        >
          {label}
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send to designer?</DialogTitle>
            <DialogDescription>
              {count} {noun} will be sent to {target}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="border-coral-500 text-coral-500 hover:bg-coral-100 hover:text-coral-500"
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirm}>
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
