'use client'

import { useState, useTransition } from 'react'
import type { RelayStep } from '@prisma/client'
import { Check, Copy } from 'lucide-react'
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
  const [failedSend, setFailedSend] = useState<{ reviewUrl: string; emailError: string | null } | null>(null)
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()

  function saveAndSend() {
    const trimmed = email.trim()
    if (!isValidEmail(trimmed)) {
      setError('Enter a valid email address.')
      return
    }
    setError(null)
    setFailedSend(null)
    startTransition(async () => {
      try {
        const result = await createAndSendMagicLinkAction({
          batchId,
          recipientName: clientName,
          recipientEmail: trimmed,
          expiresInDays: 30,
        })
        if (!result.emailSent) {
          // The link + clientReviewEmail are persisted server side, but the
          // email never reached the client. Do NOT advance the relay or close;
          // surface the error and the link so the AM can recover.
          setFailedSend({ reviewUrl: result.reviewUrl, emailError: result.emailError })
          return
        }
        await passBatonAction({ batchId, toStep })
        onComplete()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong.')
      }
    })
  }

  async function copyReviewUrl() {
    if (!failedSend) return
    try {
      await navigator.clipboard.writeText(failedSend.reviewUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy to clipboard; select the URL manually.')
    }
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
            autoFocus
          />
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        {failedSend && (
          <div
            className="rounded-xl bg-neutral-100 p-4 space-y-2"
            data-testid="client-review-email-failed"
          >
            <p className="text-sm font-medium" role="alert">
              Review link created, but the email did not send
              {failedSend.emailError ? `: ${failedSend.emailError}` : '.'}
            </p>
            <p className="text-xs text-muted-foreground">
              The link and review email are saved. Copy the link and send it to{' '}
              {clientName} manually, or pass anyway to move this into client review.
            </p>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={failedSend.reviewUrl}
                data-testid="client-review-link-url"
                className="font-mono text-[12px]"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copyReviewUrl}
                data-testid="copy-link-button"
              >
                {copied ? (
                  <>
                    <Check className="size-3.5" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

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
