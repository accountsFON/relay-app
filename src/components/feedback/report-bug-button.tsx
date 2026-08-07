'use client'

/**
 * Persistent "Report a bug" affordance shown at the sidebar bottom of
 * the in app shell. Opens a modal with a textarea, a severity dropdown,
 * and an optional screenshot; submit calls submitFeedbackAction and
 * fires a sonner toast.
 *
 * The page path the reporter is on is captured automatically and sent as
 * `pageUrl`. A screenshot (if attached) is uploaded to Vercel Blob first,
 * then its URL is submitted as `imageUrl`.
 *
 * Severity = high triggers an immediate urgent admin email server side
 * (handled by the action). The client just surfaces a slightly
 * different toast so the reporter knows the team was paged.
 *
 * Spec: projects/relay-app/2026-06-01-phase-5-item-27-feedback-channel-recommendation.md
 */

import { useRef, useState, useTransition, type FormEvent } from 'react'
import { Bug, ImagePlus, X } from 'lucide-react'
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
import { uploadFeedbackImage } from '@/lib/upload-feedback-image'

type Severity = 'low' | 'medium' | 'high'

const SEVERITY_OPTIONS: { value: Severity; label: string }[] = [
  { value: 'low', label: 'Low , minor annoyance' },
  { value: 'medium', label: 'Medium , slowing me down' },
  { value: 'high', label: 'High , blocking, page me now' },
]

const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // matches the upload route cap

export function ReportBugButton() {
  const [open, setOpen] = useState(false)
  const [bodyText, setBodyText] = useState('')
  const [severity, setSeverity] = useState<Severity>('medium')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  function clearImage() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function reset() {
    setBodyText('')
    setSeverity('medium')
    clearImage()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.files?.[0] ?? null
    if (!next) return
    if (!next.type.startsWith('image/')) {
      toast.error('Please choose an image file.')
      return
    }
    if (next.size > MAX_IMAGE_BYTES) {
      toast.error('Image is too large (5 MB max).')
      return
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(next)
    setPreviewUrl(URL.createObjectURL(next))
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = bodyText.trim()
    if (trimmed.length === 0) {
      toast.error('Tell us what happened first.')
      return
    }
    // Read the current location here (event handler, not render).
    const pageUrl = `${window.location.pathname}${window.location.search}`

    startTransition(async () => {
      try {
        let imageUrl: string | undefined
        if (file) {
          const uploaded = await uploadFeedbackImage(file)
          imageUrl = uploaded.url
        }
        const result = await submitFeedbackAction({
          bodyText: trimmed,
          severity,
          pageUrl,
          imageUrl,
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
              What happened? The page you&apos;re on and your account are
              auto attached. High severity reports page the team immediately.
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

            <div className="grid gap-1.5">
              <Label>Screenshot (optional)</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                aria-label="Attach a screenshot"
                onChange={handleFileChange}
                disabled={pending}
              />
              {previewUrl ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview, not a remote asset */}
                  <img
                    src={previewUrl}
                    alt="Screenshot preview"
                    className="h-16 w-16 rounded-md border border-border object-cover"
                  />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
                    {file?.name}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={clearImage}
                    disabled={pending}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                    Remove
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={pending}
                >
                  <ImagePlus className="h-3.5 w-3.5" aria-hidden />
                  Attach screenshot
                </Button>
              )}
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
