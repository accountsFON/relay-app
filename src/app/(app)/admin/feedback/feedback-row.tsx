'use client'

/**
 * One bug report on the admin feedback dashboard. Shows severity, submitter,
 * the page they were on, the body, an optional screenshot thumbnail, and the
 * urgent/digest send stamps. Admins can toggle a report resolved / reopen it
 * (resolveFeedbackAction, org-scoped server side).
 */

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, RotateCcw, Trash2 } from 'lucide-react'
import type { FeedbackSeverity } from '@prisma/client'

import { Button } from '@/components/ui/button'
import { StatusPill } from '@/components/ui/status-pill'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatRelative } from '@/lib/format-relative'
import {
  resolveFeedbackAction,
  deleteFeedbackAction,
} from '@/server/actions/feedback'

export interface FeedbackRowData {
  id: string
  bodyText: string
  severity: FeedbackSeverity
  createdAt: Date
  pageUrl: string | null
  imageUrl: string | null
  sentUrgentAt: Date | null
  sentInDigestAt: Date | null
  resolvedAt: Date | null
  submitter: { id: string; name: string; email: string }
  organizationName: string | null
  resolvedByName: string | null
}

const SEVERITY_ACCENT: Record<FeedbackSeverity, 'coral' | 'yellow' | 'neutral'> = {
  high: 'coral',
  medium: 'yellow',
  low: 'neutral',
}

const SEVERITY_LABEL: Record<FeedbackSeverity, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export function FeedbackRow({ feedback }: { feedback: FeedbackRowData }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const resolved = feedback.resolvedAt !== null

  function toggleResolved() {
    startTransition(async () => {
      try {
        await resolveFeedbackAction({
          feedbackId: feedback.id,
          resolved: !resolved,
        })
        toast.success(resolved ? 'Reopened' : 'Marked resolved')
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Action failed'
        toast.error(message)
      }
    })
  }

  function deleteTicket() {
    startTransition(async () => {
      try {
        await deleteFeedbackAction({ feedbackId: feedback.id })
        setConfirmDeleteOpen(false)
        toast.success('Ticket deleted')
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Delete failed'
        toast.error(message)
      }
    })
  }

  return (
    <div
      className={`px-4 py-4 ${resolved ? 'opacity-60' : ''}`}
      data-testid="feedback-row"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill variant="accent" accent={SEVERITY_ACCENT[feedback.severity]}>
              {SEVERITY_LABEL[feedback.severity]}
            </StatusPill>
            <span className="text-[13px] font-medium text-foreground">
              {feedback.submitter.name}
            </span>
            <span className="text-[12px] text-muted-foreground">
              {feedback.submitter.email}
            </span>
            {feedback.organizationName ? (
              <span className="text-[12px] text-muted-foreground">
                · {feedback.organizationName}
              </span>
            ) : null}
            <span className="text-[12px] text-muted-foreground">
              · {formatRelative(feedback.createdAt)}
            </span>
            {resolved ? (
              <StatusPill variant="accent" accent="neutral">
                {feedback.resolvedByName
                  ? `Resolved by ${feedback.resolvedByName}`
                  : 'Resolved'}
              </StatusPill>
            ) : null}
          </div>

          {feedback.pageUrl ? (
            <div className="mt-1.5">
              <Link
                href={feedback.pageUrl}
                className="text-[12px] font-mono text-blue-600 hover:underline break-all"
              >
                {feedback.pageUrl}
              </Link>
            </div>
          ) : null}

          <p className="mt-2 whitespace-pre-wrap text-[14px] text-foreground">
            {feedback.bodyText}
          </p>

          {feedback.imageUrl ? (
            <a
              href={feedback.imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- remote blob screenshot, not a bundled asset */}
              <img
                src={feedback.imageUrl}
                alt="Screenshot"
                className="max-h-40 rounded-md border border-border object-contain"
              />
            </a>
          ) : null}

          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            {feedback.sentUrgentAt ? <span>Urgent email sent</span> : null}
            {feedback.sentInDigestAt ? <span>· In weekly digest</span> : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant={resolved ? 'outline' : 'default'}
            size="sm"
            onClick={toggleResolved}
            disabled={pending}
          >
            {resolved ? (
              <>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Reopen
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" aria-hidden />
                Resolve
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Delete ticket"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={pending}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      </div>

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete this ticket?</DialogTitle>
            <DialogDescription>
              This permanently removes the ticket. It cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDeleteOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={deleteTicket}
              disabled={pending}
            >
              {pending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
