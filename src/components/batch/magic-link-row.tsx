'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { revokeMagicLinkAction } from '@/server/actions/magicLink'

export interface MagicLinkRowProps {
  id: string
  recipientName: string
  recipientEmail: string
  expiresAt: Date | string
  lastVisitedAt: Date | string | null
}

function fmtDate(value: Date | string | null): string {
  if (!value) return 'never'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return 'unknown'
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ]
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

/**
 * MagicLinkRow — one row in the batch page list of active magic links.
 *
 * The host page filters out revoked links before rendering, so this
 * component only ever shows live links + their revoke control. Revoke
 * triggers a router.refresh() so the row disappears once the server
 * has flipped revokedAt.
 */
export function MagicLinkRow(props: MagicLinkRowProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleRevoke() {
    if (!confirm(`Revoke the link sent to ${props.recipientEmail}? They will see a "link expired" page on their next visit.`)) {
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await revokeMagicLinkAction({ id: props.id })
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to revoke link')
      }
    })
  }

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
        </p>
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleRevoke}
        disabled={isPending}
        data-testid={`revoke-link-button-${props.id}`}
      >
        <Trash2 className="size-3.5" />
        <span>{isPending ? 'Revoking…' : 'Revoke'}</span>
      </Button>
    </div>
  )
}
