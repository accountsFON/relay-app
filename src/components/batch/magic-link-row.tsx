'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Copy, Mail, ExternalLink, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  revokeMagicLinkAction,
  getFreshUrlForLinkAction,
  resendMagicLinkEmailAction,
} from '@/server/actions/magicLink'

export interface MagicLinkRowProps {
  id: string
  recipientName: string
  recipientEmail: string
  expiresAt: Date | string
  lastVisitedAt: Date | string | null
  /**
   * Total number of items across review sessions for this link that
   * have signal: a non-null comment, a non-null caption suggestion,
   * or a decision other than `not_reviewed`. Zero hides the badge.
   */
  commentCount?: number
  /**
   * Latest reviewedAt across all items across all sessions for this
   * link. Surfaces as "Last activity: …" when present.
   */
  lastActivityAt?: Date | string | null
}

function fmtDate(value: Date | string | null | undefined): string {
  if (!value) return 'never'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return 'unknown'
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ]
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

function fmtRelative(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return null
  const diffMs = Date.now() - d.getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 14) return `${days}d ago`
  return fmtDate(d)
}

type StatusKind = 'copied' | 'sent' | 'error' | null

/**
 * MagicLinkRow , one row in the batch page list of active magic links.
 *
 * Renders Copy URL / Resend Email / Open Preview / Revoke for an AM.
 * Copy / Resend / Open Preview all rotate the underlying token (mint a
 * new MagicLink row, revoke the old) so we can return a usable URL
 * without storing the raw token on the row. The host page revalidates
 * after each action so the row id refreshes to point at the new link.
 */
export function MagicLinkRow(props: MagicLinkRowProps) {
  const router = useRouter()
  const [pendingAction, setPendingAction] = useState<
    'copy' | 'resend' | 'open' | 'revoke' | null
  >(null)
  const [_isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<{ kind: StatusKind; message: string | null }>({
    kind: null,
    message: null,
  })

  function flash(kind: Exclude<StatusKind, null>, message: string) {
    setStatus({ kind, message })
    // Auto-clear after 2.5s so the row settles back to its base state.
    setTimeout(() => {
      setStatus((curr) =>
        curr.kind === kind && curr.message === message
          ? { kind: null, message: null }
          : curr,
      )
    }, 2500)
  }

  function handleCopy() {
    setPendingAction('copy')
    setStatus({ kind: null, message: null })
    startTransition(async () => {
      try {
        const { url } = await getFreshUrlForLinkAction({ id: props.id })
        try {
          await navigator.clipboard.writeText(url)
          flash('copied', 'Copied!')
        } catch {
          // Clipboard may be blocked (insecure context, perms). Surface
          // the URL so the AM can grab it manually.
          flash('copied', url)
        }
        router.refresh()
      } catch (err) {
        flash('error', err instanceof Error ? err.message : 'Failed to copy link')
      } finally {
        setPendingAction(null)
      }
    })
  }

  function handleResend() {
    if (
      !confirm(
        `Resend the review link email to ${props.recipientEmail}? The old link will stop working.`,
      )
    ) {
      return
    }
    setPendingAction('resend')
    setStatus({ kind: null, message: null })
    startTransition(async () => {
      try {
        const result = await resendMagicLinkEmailAction({ id: props.id })
        if (result.emailSent) {
          flash('sent', 'Email sent!')
        } else {
          flash(
            'error',
            result.emailError
              ? `Email failed: ${result.emailError}`
              : 'Email failed to send',
          )
        }
        router.refresh()
      } catch (err) {
        flash('error', err instanceof Error ? err.message : 'Failed to resend')
      } finally {
        setPendingAction(null)
      }
    })
  }

  function handleOpenPreview() {
    setPendingAction('open')
    setStatus({ kind: null, message: null })
    startTransition(async () => {
      try {
        const { url } = await getFreshUrlForLinkAction({ id: props.id })
        // window.open inside an async chain may be blocked by popup
        // blockers in some browsers; we tolerate that , the AM can
        // fall back to Copy URL.
        const opened = window.open(url, '_blank', 'noopener,noreferrer')
        if (!opened) {
          flash('error', 'Popup blocked. Use Copy URL instead.')
        }
        router.refresh()
      } catch (err) {
        flash('error', err instanceof Error ? err.message : 'Failed to open preview')
      } finally {
        setPendingAction(null)
      }
    })
  }

  function handleRevoke() {
    if (
      !confirm(
        `Revoke the link sent to ${props.recipientEmail}? They will see a "link expired" page on their next visit.`,
      )
    ) {
      return
    }
    setPendingAction('revoke')
    setStatus({ kind: null, message: null })
    startTransition(async () => {
      try {
        await revokeMagicLinkAction({ id: props.id })
        router.refresh()
      } catch (err) {
        flash('error', err instanceof Error ? err.message : 'Failed to revoke link')
      } finally {
        setPendingAction(null)
      }
    })
  }

  const isBusy = pendingAction !== null
  const lastActivityLabel = fmtRelative(props.lastActivityAt)
  const commentCount = props.commentCount ?? 0

  return (
    <div
      className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3"
      data-testid={`magic-link-row-${props.id}`}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium truncate">
          {props.recipientName}
          <span className="ml-2 text-muted-foreground font-normal">
            {props.recipientEmail}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          Expires {fmtDate(props.expiresAt)} · Last visited {fmtDate(props.lastVisitedAt)}
          {commentCount > 0 && (
            <>
              {' · '}
              <span
                className="font-medium text-foreground"
                data-testid={`magic-link-comment-count-${props.id}`}
              >
                {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
              </span>
            </>
          )}
          {lastActivityLabel && (
            <>
              {' · '}
              <span data-testid={`magic-link-last-activity-${props.id}`}>
                Last activity: {lastActivityLabel}
              </span>
            </>
          )}
        </p>
        {status.kind === 'error' && status.message && (
          <p
            className="text-xs text-destructive"
            role="alert"
            data-testid={`magic-link-row-error-${props.id}`}
          >
            {status.message}
          </p>
        )}
        {status.kind === 'copied' && status.message && (
          <p
            className="text-xs text-foreground"
            data-testid={`magic-link-row-copied-${props.id}`}
          >
            <Check className="inline size-3 mr-1" />
            {status.message}
          </p>
        )}
        {status.kind === 'sent' && status.message && (
          <p
            className="text-xs text-foreground"
            data-testid={`magic-link-row-sent-${props.id}`}
          >
            <Check className="inline size-3 mr-1" />
            {status.message}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          disabled={isBusy}
          title="Copy a fresh URL"
          aria-label="Copy URL"
          data-testid={`copy-link-button-${props.id}`}
        >
          <Copy className="size-3.5" />
          <span className="sr-only">Copy URL</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleResend}
          disabled={isBusy}
          title="Resend the email"
          aria-label="Resend Email"
          data-testid={`resend-link-button-${props.id}`}
        >
          <Mail className="size-3.5" />
          <span className="sr-only">Resend Email</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleOpenPreview}
          disabled={isBusy}
          title="Open the review page in a new tab"
          aria-label="Open Preview"
          data-testid={`open-link-button-${props.id}`}
        >
          <ExternalLink className="size-3.5" />
          <span className="sr-only">Open Preview</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRevoke}
          disabled={isBusy}
          data-testid={`revoke-link-button-${props.id}`}
        >
          <Trash2 className="size-3.5" />
          <span>{pendingAction === 'revoke' ? 'Revoking…' : 'Revoke'}</span>
        </Button>
      </div>
    </div>
  )
}
