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
import { clearAllMentionsAction } from '@/app/(app)/clients/[id]/activity/actions'

export function ClearAllButton({
  count,
  unreadCount,
}: {
  count: number
  unreadCount: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleConfirm() {
    startTransition(async () => {
      try {
        await clearAllMentionsAction()
        setOpen(false)
        router.refresh()
      } catch {
        // best effort
      }
    })
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Clear all
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Clear all notifications?</DialogTitle>
            <DialogDescription>
              This permanently clears all {count} notifications
              {unreadCount > 0 ? `, including ${unreadCount} unread` : ''}. This
              can not be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              aria-label="Clear all notifications"
              onClick={handleConfirm}
              disabled={isPending}
            >
              {isPending ? 'Clearing…' : 'Clear all'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
