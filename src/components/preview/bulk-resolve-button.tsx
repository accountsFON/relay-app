'use client'

import { useState, useTransition } from 'react'
import { CheckCheck } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { bulkResolveOnPostAction } from '@/server/actions/threads'

export interface BulkResolveButtonProps {
  postId: string
  /** Open-thread count surfaced on the trigger for context. */
  openThreadCount: number
  /** Called with the number of threads flipped on success. */
  onResolved?: (count: number) => void
  className?: string
}

/**
 * Per-post bulk-resolve override (AM only).
 *
 * Per design § AM overrides: opens a modal that requires a reason note. On
 * submit, every open thread on the post flips to resolved with the supplied
 * `resolvedReason`. Disabled when there are zero open threads.
 *
 * The trigger renders as a small sidebar action button so it sits beside
 * the post in `<PreviewPageShell>` without dominating the layout.
 */
export function BulkResolveButton({
  postId,
  openThreadCount,
  onResolved,
  className,
}: BulkResolveButtonProps) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const disabled = openThreadCount === 0

  function handleOpenChange(next: boolean) {
    if (isPending) return
    setOpen(next)
    if (!next) {
      setReason('')
      setError(null)
    }
  }

  function handleConfirm() {
    const trimmed = reason.trim()
    if (trimmed.length === 0) {
      setError('Reason is required')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        const result = await bulkResolveOnPostAction({
          postId,
          resolvedReason: trimmed,
        })
        onResolved?.(result.count)
        setOpen(false)
        setReason('')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to resolve threads')
      }
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
        data-testid="bulk-resolve-button"
        className={className}
      >
        <CheckCheck className="size-3.5 shrink-0" aria-hidden="true" />
        <span>Resolve all{openThreadCount > 0 ? ` (${openThreadCount})` : ''}</span>
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve all open threads</DialogTitle>
            <DialogDescription>
              {openThreadCount === 1
                ? '1 open thread on this post will be marked resolved.'
                : `${openThreadCount} open threads on this post will be marked resolved.`}{' '}
              The reason note is attached to every thread for audit.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-1">
            <label
              htmlFor="bulk-resolve-reason"
              className="text-sm font-medium text-foreground"
            >
              Reason
            </label>
            <Textarea
              id="bulk-resolve-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Addressed offline with the client"
              data-testid="bulk-resolve-reason-input"
              autoFocus
              disabled={isPending}
              rows={3}
            />
            {error && (
              <p
                role="alert"
                data-testid="bulk-resolve-error"
                className="text-xs text-destructive"
              >
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={isPending || reason.trim().length === 0}
              data-testid="bulk-resolve-confirm"
            >
              {isPending ? 'Resolving...' : 'Resolve all'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
