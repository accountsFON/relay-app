'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { archiveClientAction } from '@/app/(app)/trash/actions'

interface Props {
  clientId: string
  clientName: string
}

/**
 * ArchiveClientButton — header action that soft-deletes a client after a
 * typed-name confirmation.
 *
 * Extra friction is intentional: archiving a client cascades to all its
 * batches, runs, and posts. The user must type the client's name exactly to
 * enable the confirm button.
 *
 * Client component so it can own the dialog open/close state, the typed
 * input value, and the transition. Imports `archiveClientAction` directly
 * (server action) — keeps the server/client boundary clean and avoids prop
 * serialisation.
 *
 * On success, redirects to /clients so the user is never left on a now-
 * archived client page with live actions still visible.
 */
export function ArchiveClientButton({ clientId, clientName }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [isPending, startTransition] = useTransition()
  const matches = typed === clientName

  function handleOpenChange(next: boolean) {
    if (isPending) return
    setOpen(next)
    if (!next) setTyped('')
  }

  function handleConfirm() {
    if (!matches) return
    startTransition(async () => {
      await archiveClientAction(clientId)
      router.push('/clients')
    })
  }

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Archive client
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive {clientName}?</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              All batches, runs, and posts will move to trash and be permanently
              deleted in 30 days. You can restore this client from the admin
              trash view before then.
            </p>
            <p className="text-sm">
              Type{' '}
              <code className="font-mono rounded bg-muted px-1 py-0.5 text-xs">
                {clientName}
              </code>{' '}
              to confirm:
            </p>
            <Input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              placeholder={clientName}
              aria-label="Type client name to confirm"
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
              variant="destructive"
              onClick={handleConfirm}
              disabled={!matches || isPending}
            >
              {isPending ? 'Archiving…' : 'Archive client'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
