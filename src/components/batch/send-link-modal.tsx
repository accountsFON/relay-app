'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createAndSendMagicLinkAction } from '@/server/actions/magicLink'
import { parseRecipientEmails } from '@/lib/recipient-emails'

interface Props {
  batchId: string
  clientName: string
  clientReviewEmail?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSent?: () => void
}

interface SuccessState {
  reviewUrl: string
  emailSent: boolean
  emailError: string | null
  recipients: { email: string; sent: boolean; error: string | null }[]
}

const MIN_DAYS = 1
const MAX_DAYS = 90
const DEFAULT_DAYS = 30

export function SendLinkModal({ batchId, clientName, clientReviewEmail, open, onOpenChange, onSent }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(clientName ?? '')
  const [email, setEmail] = useState(clientReviewEmail ?? '')
  const [days, setDays] = useState(String(DEFAULT_DAYS))
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<SuccessState | null>(null)
  const [copied, setCopied] = useState(false)

  function reset() {
    setName(clientName ?? '')
    setEmail(clientReviewEmail ?? '')
    setDays(String(DEFAULT_DAYS))
    setError(null)
    setSuccess(null)
    setCopied(false)
  }

  function handleClose(next: boolean) {
    if (!next) {
      // Refresh the host page if a link was minted so the list updates.
      if (success) router.refresh()
      reset()
    }
    onOpenChange(next)
  }

  function validate(parsed: { emails: string[]; invalid: string[] }): string | null {
    if (!name.trim()) return 'Recipient name is required'
    if (parsed.invalid.length > 0) {
      return `Not a valid email address: ${parsed.invalid.join(', ')}`
    }
    if (parsed.emails.length === 0) return 'At least one recipient email is required'
    const d = Number(days)
    if (!Number.isFinite(d) || d < MIN_DAYS || d > MAX_DAYS) {
      return `Expiry must be between ${MIN_DAYS} and ${MAX_DAYS} days`
    }
    return null
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = parseRecipientEmails(email)
    const err = validate(parsed)
    if (err) {
      setError(err)
      return
    }
    setError(null)

    startTransition(async () => {
      try {
        const result = await createAndSendMagicLinkAction({
          batchId,
          recipientName: name.trim(),
          recipientEmails: parsed.emails,
          expiresInDays: Number(days),
        })
        setSuccess({
          reviewUrl: result.reviewUrl,
          emailSent: result.emailSent,
          emailError: result.emailError,
          recipients: result.recipients,
        })
        onSent?.()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create link')
      }
    })
  }

  async function handleCopy() {
    if (!success) return
    try {
      await navigator.clipboard.writeText(success.reviewUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy to clipboard; select the URL manually')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send review link</DialogTitle>
          <DialogDescription>
            Mints a magic link for {clientName} and emails it to the recipient.
            No login required on their end.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="space-y-4">
            <div
              className="rounded-xl bg-neutral-100 p-4 space-y-2"
              data-testid="send-link-success"
            >
              <p className="text-sm font-medium">
                {(() => {
                  const total = success.recipients.length
                  const sent = success.recipients.filter((r) => r.sent).length
                  if (success.emailSent) {
                    return `Link created and emailed to ${total} recipient${total === 1 ? '' : 's'}.`
                  }
                  if (sent > 0) {
                    return `Link created. Emailed ${sent} of ${total}; ${total - sent} failed — copy and send manually.`
                  }
                  return 'Link created. Email failed; copy and send manually.'
                })()}
              </p>
              {!success.emailSent &&
                (() => {
                  const failed = success.recipients.filter((r) => !r.sent)
                  const failedList =
                    failed.length > 0 ? failed.map((r) => r.email).join(', ') : null
                  return (
                    <p className="text-xs text-destructive">
                      {failedList
                        ? `Failed: ${failedList}`
                        : success.emailError}
                    </p>
                  )
                })()}
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={success.reviewUrl}
                  data-testid="send-link-url"
                  className="font-mono text-[12px]"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
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
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="send-link-name">Recipient name</Label>
              <Input
                id="send-link-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                disabled={isPending}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="send-link-email">Recipient email(s)</Label>
              <Input
                id="send-link-email"
                type="text"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@client.com, bob@client.com"
                disabled={isPending}
                required
              />
              <p className="text-xs text-muted-foreground">
                Separate multiple recipients with commas. One link is emailed to
                each.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="send-link-days">Expires in (days)</Label>
              <Input
                id="send-link-days"
                type="number"
                min={MIN_DAYS}
                max={MAX_DAYS}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                disabled={isPending}
                required
              />
              <p className="text-xs text-muted-foreground">
                Between {MIN_DAYS} and {MAX_DAYS} days. Default is {DEFAULT_DAYS}.
              </p>
            </div>

            {error && (
              <p
                className="text-sm text-destructive"
                data-testid="send-link-error"
                role="alert"
              >
                {error}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Sending…' : 'Generate and send'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
