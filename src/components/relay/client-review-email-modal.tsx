'use client'

import { useState, useTransition } from 'react'
import type { RelayStep } from '@prisma/client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createAndSendMagicLinkAction } from '@/server/actions/magicLink'
import { passBatonAction } from '@/server/actions/relay'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  batchId: string
  clientName: string
  toStep: RelayStep
  /** Called after a successful pass (the parent closes + refreshes). */
  onComplete: () => void
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function ClientReviewEmailModal({
  open,
  onOpenChange,
  batchId,
  clientName,
  toStep,
  onComplete,
}: Props) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function saveAndSend() {
    const trimmed = email.trim()
    if (!isValidEmail(trimmed)) {
      setError('Enter a valid email address.')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await createAndSendMagicLinkAction({
          batchId,
          recipientName: clientName,
          recipientEmail: trimmed,
          expiresInDays: 30,
        })
        await passBatonAction({ batchId, toStep })
        onComplete()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong.')
      }
    })
  }

  function passAnyway() {
    setError(null)
    startTransition(async () => {
      try {
        await passBatonAction({ batchId, toStep })
        onComplete()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Pass failed.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="client-review-email-modal">
        <DialogHeader>
          <DialogTitle>No review email on file for {clientName}</DialogTitle>
          <DialogDescription>
            Clients review through a magic link. Add the client&apos;s email to send
            them this relay, or pass anyway to move it into client review without
            sending one.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="client-review-email">Client review email</Label>
          <Input
            id="client-review-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="client@example.com"
            disabled={isPending}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" onClick={passAnyway} disabled={isPending}>
            Pass anyway
          </Button>
          <Button type="button" onClick={saveAndSend} disabled={isPending}>
            {isPending ? 'Working…' : 'Save & send review link'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
