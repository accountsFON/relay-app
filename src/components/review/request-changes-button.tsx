'use client'

/**
 * RequestChangesButton: the AM's in-step control on the /preview surface.
 * Runs the passed server action (sets awaiting_design_revisions + notifies the
 * assigned designer; the batch stays at am_review_design, AM-held), then shows
 * a clear confirmation that the designer was notified.
 *
 * Clicking "Request changes" opens a confirmation modal. The action only fires
 * after the AM clicks "Yes, request changes" inside the modal.
 */

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface RequestChangesButtonProps {
  /** Server action that sets awaiting_design_revisions + notifies designer. */
  onClick: () => Promise<void>
  /** Assigned designer's display name, for the "notified" confirmation. */
  designerName?: string | null
  disabled?: boolean
}

export function RequestChangesButton({
  onClick,
  designerName,
  disabled,
}: RequestChangesButtonProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [open, setOpen] = useState(false)

  function confirmRequest() {
    setOpen(false)
    setError(null)
    startTransition(async () => {
      try {
        await onClick()
        setSent(true)
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to request changes',
        )
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="default"
        onClick={() => setOpen(true)}
        disabled={disabled || isPending || sent}
        data-testid="request-changes-button"
      >
        {isPending ? 'Requesting...' : 'Request changes'}
      </Button>
      {sent && (
        <p
          data-testid="request-changes-success"
          className="text-[11px] text-muted-foreground"
        >
          {designerName
            ? `Sent to ${designerName}. They've been notified.`
            : 'Changes requested. No designer is assigned to notify.'}
        </p>
      )}
      {error && (
        <p
          role="alert"
          data-testid="request-changes-error"
          className="text-xs text-destructive"
        >
          {error}
        </p>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        {/*
          Widen past the shared DialogContent default (sm:max-w-sm = 384px):
          the two long footer buttons ("No, go back and add notes" + "Yes,
          request changes") together need ~500px, so even sm:max-w-md (448px)
          left them cramped/edge-to-edge. sm:max-w-lg (512px) fits them with
          breathing room. RESPONSIVE sm:max-w-* so twMerge keeps the mobile
          max-w-[calc(100%-2rem)] margin (matches the #340/#341 gate-modal fix).
        */}
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Request changes?</DialogTitle>
            <DialogDescription>
              {designerName
                ? `This will notify ${designerName} that you've completed your feedback.`
                : `This will notify the designer that you've completed your feedback.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              data-testid="request-changes-cancel"
            >
              No, go back and add notes
            </Button>
            <Button
              variant="default"
              onClick={confirmRequest}
              data-testid="request-changes-confirm"
            >
              Yes, request changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
