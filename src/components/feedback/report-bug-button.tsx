'use client'

/**
 * Persistent "Report a bug" affordance shown at the sidebar bottom of
 * the in app shell. Opens a modal with a textarea + severity dropdown;
 * submit calls submitFeedbackAction and fires a sonner toast.
 *
 * Severity = high triggers an immediate urgent admin email server side
 * (handled by the action). The client just surfaces a slightly
 * different toast so the reporter knows the team was paged.
 *
 * Spec: projects/relay-app/2026-06-01-phase-5-item-27-feedback-channel-recommendation.md
 */

import { useState, useTransition, type FormEvent } from 'react'
import { Bug } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { submitFeedbackAction } from '@/server/actions/feedback'

type Severity = 'low' | 'medium' | 'high'

const SEVERITY_OPTIONS: { value: Severity; label: string }[] = [
  { value: 'low', label: 'Low , minor annoyance' },
  { value: 'medium', label: 'Medium , slowing me down' },
  { value: 'high', label: 'High , blocking, page me now' },
]

export function ReportBugButton() {
  const [open, setOpen] = useState(false)
  const [bodyText, setBodyText] = useState('')
  const [severity, setSeverity] = useState<Severity>('medium')
  const [pending, startTransition] = useTransition()

  function reset() {
    setBodyText('')
    setSeverity('medium')
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = bodyText.trim()
    if (trimmed.length === 0) {
      toast.error('Tell us what happened first.')
      return
    }
    startTransition(async () => {
      try {
        const result = await submitFeedbackAction({
          bodyText: trimmed,
          severity,
        })
        // Toast copy follows the server's report of whether the urgent
        // path actually fired. Falling back to the chosen severity
        // (when the server reports false because of a Resend hiccup)
        // would mislead the reporter into thinking we got paged when
        // the email is sitting in the digest queue.
        if (result.urgentEmailSent) {
          toast.success("Got it. We've been paged.")
        } else {
          toast.success("Thanks, we'll look at this.")
        }
        reset()
        setOpen(false)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Submit failed'
        toast.error(`Could not send: ${message}`)
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-muted-foreground hover:bg-neutral-100 hover:text-neutral-700 transition-colors"
        aria-label="Report a bug"
      >
        <Bug className="h-3.5 w-3.5" aria-hidden />
        <span>Report a bug</span>
      </button>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Report a bug</DialogTitle>
            <DialogDescription>
              What happened? Page URL and your account are auto attached.
              High severity reports page the team immediately.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="feedback-body">What happened?</Label>
              <Textarea
                id="feedback-body"
                name="feedback-body"
                placeholder="Tap Submit on /clients and got a blank page…"
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                required
                rows={5}
                maxLength={4000}
                autoFocus
                disabled={pending}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="feedback-severity">Severity</Label>
              <Select
                value={severity}
                onValueChange={(val) => setSeverity(val as Severity)}
                disabled={pending}
              >
                <SelectTrigger
                  id="feedback-severity"
                  className="w-full"
                  size="default"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                />
              }
            >
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending || bodyText.trim().length === 0}>
              {pending ? 'Sending…' : 'Submit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default ReportBugButton
