'use client'

/**
 * "Delete all" control for the Helpdesk Tickets dashboard. Permanently removes
 * every ticket in the admin's scope (deleteAllFeedbackAction is org-scoped
 * server side: platform owners clear all orgs, an org admin only their own).
 * Guarded by a confirmation dialog; disabled when there are no tickets.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { deleteAllFeedbackAction } from '@/server/actions/feedback'

export function DeleteAllTicketsButton({ count }: { count: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function deleteAll() {
    startTransition(async () => {
      try {
        const res = await deleteAllFeedbackAction()
        setOpen(false)
        toast.success(
          `Deleted ${res.count} ticket${res.count === 1 ? '' : 's'}`,
        )
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Delete failed')
      }
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={count === 0}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
        Delete all
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              Delete all {count} ticket{count === 1 ? '' : 's'}?
            </DialogTitle>
            <DialogDescription>
              This permanently removes every ticket you can see. It cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={deleteAll}
              disabled={pending}
            >
              {pending ? 'Deleting…' : 'Delete all'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
