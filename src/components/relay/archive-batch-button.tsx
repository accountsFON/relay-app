'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { archiveBatchAction } from '@/app/(app)/trash/actions'
import { SimpleTooltip } from '@/components/relay/relay-tooltips'

interface Props {
  batchId: string
}

/**
 * ArchiveBatchButton: header action that soft-deletes a batch after confirmation.
 *
 * Client component so it can own the dialog open/close state and the transition.
 * Imports `archiveBatchAction` directly (server action) rather than receiving
 * it as a prop, keeps the server/client boundary clean and avoids prop-serialisation.
 */
export function ArchiveBatchButton({ batchId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleConfirm() {
    startTransition(async () => {
      await archiveBatchAction(batchId)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <SimpleTooltip content="Archive this relay. It will not appear in active views but stays in trash for 90 days.">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Archive relay
        </Button>
      </SimpleTooltip>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive this relay?</DialogTitle>
            <DialogDescription>
              Its posts and runs will move to trash and be permanently deleted
              in 30 days. You can restore the relay from the admin trash view
              before then.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={isPending}
            >
              {isPending ? 'Archiving…' : 'Archive'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
