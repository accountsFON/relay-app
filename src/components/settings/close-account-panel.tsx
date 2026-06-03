'use client'

/**
 * Danger Zone on /settings/account. Lets a user close (soft deactivate)
 * their own account behind a type to confirm gate. On success it calls
 * closeMyAccountAction then signs the user out. When `blocked` (last admin /
 * last platform owner), the trigger is disabled and the reason is shown; the
 * server enforces the same guard.
 */

import { useState, useTransition } from 'react'
import { useClerk } from '@clerk/nextjs'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { closeMyAccountAction } from '@/app/(app)/settings/account/actions'

export interface CloseAccountPanelProps {
  userEmail: string
  blocked: boolean
  blockReason: string | null
  inventoryText: string
}

export function CloseAccountPanel({
  userEmail,
  blocked,
  blockReason,
  inventoryText,
}: CloseAccountPanelProps) {
  const { signOut } = useClerk()
  const [open, setOpen] = useState(false)
  const [typedEmail, setTypedEmail] = useState('')
  const [isPending, startTransition] = useTransition()

  const emailMatches = typedEmail === userEmail
  const canConfirm = emailMatches && !isPending

  function confirmClose() {
    if (!canConfirm) return
    startTransition(async () => {
      try {
        await closeMyAccountAction()
        await signOut({ redirectUrl: '/sign-in' })
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Could not close your account.'
        toast.error(message)
      }
    })
  }

  return (
    <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-4">
      <div>
        <p className="text-sm font-medium text-foreground">Delete account</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Closing your account signs you out and locks you out of Relay. Your
          assigned work stays with you until an agency admin reassigns it, and
          an admin can restore your access later.
        </p>
      </div>

      {inventoryText && (
        <p className="text-[13px] text-muted-foreground">{inventoryText}</p>
      )}

      <Button
        type="button"
        variant="destructive"
        onClick={() => setOpen(true)}
        disabled={blocked || isPending}
      >
        Delete my account
      </Button>

      {blockReason && (
        <p className="text-[13px] text-muted-foreground">{blockReason}</p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              You will be signed out immediately and locked out of Relay. Any
              relays you are holding pause until an admin reassigns them. An
              agency admin can restore your access. To confirm, type your email
              below.
            </DialogDescription>
          </DialogHeader>

          <label className="block text-[12px] font-medium text-foreground">
            Type your email to confirm
            <input
              type="text"
              value={typedEmail}
              onChange={(e) => setTypedEmail(e.target.value)}
              placeholder={userEmail}
              disabled={isPending}
              className="mt-1 block w-full rounded border border-border bg-background px-2 py-1 text-[13px]"
            />
          </label>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmClose}
              disabled={!canConfirm}
            >
              {isPending ? 'Closing…' : 'Close account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default CloseAccountPanel
