'use client'

import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SendLinkModal } from '@/components/batch/send-link-modal'
import {
  FinalQaOnceOver,
  allQaOnceOverChecked,
} from '@/components/relay/final-qa-once-over'

export interface SendToClientReviewButtonProps {
  batchId: string
  clientReviewEnabled: boolean
  clientName: string
  clientReviewEmail?: string | null
  /** Agency review window; seeds the review-link default expiry (P2 #23). */
  reviewWindowDays?: number
  disabled?: boolean
  onAdvance: () => void
}

/**
 * Batch-page confirm flow for Design Review → Client Review / Scheduling
 * (P1 #13). Replaces the retired Pre-Client QA step's persisted send-link row.
 *
 * The AM clicks the sticky Pass button ("Send to Client Review" for review
 * clients, "Final QA" for no-review clients), which opens a modal with the
 * ephemeral final-QA once-over. The confirm button is gated on every once-over
 * item being checked.
 *
 * - Review clients: confirming opens the SendLinkModal; the relay only advances
 *   once the magic link is actually sent. A "Skip link and advance" secondary
 *   preserves the old bypass (advance without minting a link).
 * - No-review clients: confirming advances straight to Scheduling — no link.
 */
export function SendToClientReviewButton({
  batchId,
  clientReviewEnabled,
  clientName,
  clientReviewEmail,
  reviewWindowDays,
  disabled = false,
  onAdvance,
}: SendToClientReviewButtonProps) {
  const [open, setOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [checked, setChecked] = useState<Record<number, boolean>>({})

  const label = clientReviewEnabled ? 'Send to Client Review' : 'Final QA'
  const confirmLabel = clientReviewEnabled ? 'Continue' : 'Move to Scheduling'
  const allChecked = allQaOnceOverChecked(checked)

  function handleConfirm() {
    setOpen(false)
    if (clientReviewEnabled) {
      setLinkOpen(true)
    } else {
      onAdvance()
    }
  }

  return (
    <>
      <Button
        type="button"
        className="w-full"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {label}
        <ArrowRight />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>
              Run the final QA once-over before this relay moves on.
            </DialogDescription>
          </DialogHeader>

          <FinalQaOnceOver
            checked={checked}
            onToggle={(i, v) => setChecked((c) => ({ ...c, [i]: v }))}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            {clientReviewEnabled && (
              <Button
                type="button"
                variant="ghost"
                disabled={!allChecked}
                onClick={() => {
                  setOpen(false)
                  onAdvance()
                }}
              >
                Skip link and advance
              </Button>
            )}
            <Button
              type="button"
              disabled={!allChecked}
              onClick={handleConfirm}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {linkOpen && (
        <SendLinkModal
          batchId={batchId}
          clientName={clientName}
          clientReviewEmail={clientReviewEmail}
          reviewWindowDays={reviewWindowDays}
          open
          onOpenChange={(o) => {
            if (!o) setLinkOpen(false)
          }}
          onSent={() => {
            setLinkOpen(false)
            onAdvance()
          }}
        />
      )}
    </>
  )
}
