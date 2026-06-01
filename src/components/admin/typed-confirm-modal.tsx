'use client'

import { useState, useTransition } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  message: string
  /** The exact string the user must type to enable the confirm button. */
  confirmString: string
  onConfirm: () => Promise<void>
  destructive?: boolean
}

/**
 * TypedConfirmModal: reusable confirmation dialog that requires the user to
 * type a specific string before the destructive action is enabled.
 *
 * Used for:
 *   - Single-row permanent delete: confirmString = entity label
 *   - Bulk permanent delete: confirmString = String(selectedCount)
 *
 * Uses useTransition instead of useState(pending) so the confirm callback
 * integrates cleanly with React's concurrent scheduler. Clears typed value
 * on close and on successful confirmation.
 */
export function TypedConfirmModal({
  open,
  onOpenChange,
  title,
  message,
  confirmString,
  onConfirm,
  destructive = true,
}: Props) {
  const [typed, setTyped] = useState('')
  const [isPending, startTransition] = useTransition()
  const matches = typed === confirmString

  function handleOpenChange(next: boolean) {
    if (isPending) return
    onOpenChange(next)
    if (!next) setTyped('')
  }

  function handleConfirm() {
    if (!matches || isPending) return
    startTransition(async () => {
      await onConfirm()
      onOpenChange(false)
      setTyped('')
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <p className="text-sm text-muted-foreground">{message}</p>
          <p className="text-sm">
            Type{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              {confirmString}
            </code>{' '}
            to confirm:
          </p>
          <Input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
            placeholder={confirmString}
            aria-label="Type to confirm"
            disabled={isPending}
          />
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
            variant={destructive ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={!matches || isPending}
          >
            {isPending ? 'Working...' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
