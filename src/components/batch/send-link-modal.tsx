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
import { addDays, daysUntilDate, formatDateInputValue } from '@/lib/expiry-date'

interface Props {
  batchId: string
  clientName: string
  clientReviewEmail?: string | null
  /** Agency review window (Organization.reviewWindowDays); seeds the default
   *  expiry date. Falls back to DEFAULT_REVIEW_WINDOW_DAYS when unset. */
  reviewWindowDays?: number
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
const DEFAULT_REVIEW_WINDOW_DAYS = 7

/** Default expiry date = today + the agency review window, clamped to bounds. */
function defaultExpiryDate(reviewWindowDays?: number): string {
  const window = Number.isFinite(reviewWindowDays)
    ? Math.min(MAX_DAYS, Math.max(MIN_DAYS, reviewWindowDays as number))
    : DEFAULT_REVIEW_WINDOW_DAYS
  return formatDateInputValue(addDays(new Date(), window))
}

export function SendLinkModal({ batchId, clientName, clientReviewEmail, reviewWindowDays, open, onOpenChange, onSent }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(clientName ?? '')
  const [email, setEmail] = useState(clientReviewEmail ?? '')
  const [expiryDate, setExpiryDate] = useState(() => defaultExpiryDate(reviewWindowDays))
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<SuccessState | null>(null)
  const [copied, setCopied] = useState(false)

  function reset() {
    setName(clientName ?? '')
    setEmail(clientReviewEmail ?? '')
    setExpiryDate(defaultExpiryDate(reviewWindowDays))
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

  function validate(
    parsed: { emails: string[]; invalid: string[] },
    expiryDays: number,
  ): string | null {
    if (!name.trim()) return 'Recipient name is required'
    if (parsed.invalid.length > 0) {
      return `Not a valid email address: ${parsed.invalid.join(', ')}`
    }
    if (parsed.emails.length === 0) return 'At least one recipient email is required'
    if (!expiryDate || Number.isNaN(expiryDays)) return 'Pick an expiry date'
    if (expiryDays < MIN_DAYS) return 'Expiry must be a future date'
    if (expiryDays > MAX_DAYS) return `Expiry can be at most ${MAX_DAYS} days out`
    return null
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = parseRecipientEmails(email)
    const expiryDays = daysUntilDate(expiryDate, new Date())
    const err = validate(parsed, expiryDays)
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
          expiresInDays: expiryDays,
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
              <Label htmlFor="send-link-expiry">Link expires on</Label>
              <Input
                id="send-link-expiry"
                type="date"
                min={formatDateInputValue(addDays(new Date(), MIN_DAYS))}
                max={formatDateInputValue(addDays(new Date(), MAX_DAYS))}
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                disabled={isPending}
                required
              />
              <p className="text-xs text-muted-foreground">
                Defaults to your agency review window. Up to {MAX_DAYS} days out.
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
