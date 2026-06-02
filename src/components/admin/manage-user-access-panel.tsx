'use client'

/**
 * Admin "Manage access" panel for a single user, shown on
 * /admin/users/[id]. Exposes deactivate / reactivate / permanently-delete.
 *
 * Gating mirrors the server actions:
 *   - canDeactivate false  -> render nothing.
 *   - Active user          -> "Deactivate access" (confirm dialog).
 *   - Deactivated user     -> "Reactivate access", plus, when canHardDelete,
 *                             a permanently-delete section behind a
 *                             reassign-target + type-to-confirm gate.
 *
 * isSelf / isLastPlatformOwner disable the destructive controls with a
 * visible reason (the server rejects these too; the UI just avoids the
 * round trip).
 */

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
import {
  deactivateUserAction,
  reactivateUserAction,
  hardDeleteUserAction,
} from '@/app/(app)/admin/users/actions'

export interface ManageUserAccessPanelProps {
  userId: string
  userEmail: string
  isDeactivated: boolean
  canDeactivate: boolean
  canHardDelete: boolean
  isSelf: boolean
  isLastPlatformOwner: boolean
  ownedInventory: {
    heldBatches: number
    assignedAmClients: number
    assignedDesignerClients: number
    triggeredRuns: number
    createdMagicLinks: number
  }
  reassignCandidates: { id: string; name: string; email: string }[]
}

function plural(n: number, singular: string, pluralForm?: string) {
  return n === 1 ? singular : (pluralForm ?? `${singular}s`)
}

/** Build a human-readable summary of what this user owns. Lists only the
 *  nonzero categories; when everything is zero, says so. */
function inventorySentence(
  inv: ManageUserAccessPanelProps['ownedInventory'],
): string {
  const parts: string[] = []
  if (inv.heldBatches > 0) {
    parts.push(`Holds ${inv.heldBatches} ${plural(inv.heldBatches, 'batch', 'batches')}`)
  }
  if (inv.assignedAmClients > 0) {
    parts.push(`AM on ${inv.assignedAmClients} ${plural(inv.assignedAmClients, 'client')}`)
  }
  if (inv.assignedDesignerClients > 0) {
    parts.push(`designer on ${inv.assignedDesignerClients}`)
  }
  if (inv.triggeredRuns > 0) {
    parts.push(`triggered ${inv.triggeredRuns} ${plural(inv.triggeredRuns, 'run')}`)
  }
  if (inv.createdMagicLinks > 0) {
    parts.push(
      `created ${inv.createdMagicLinks} ${plural(inv.createdMagicLinks, 'magic link')}`,
    )
  }
  if (parts.length === 0) return 'Owns nothing to reassign.'
  return `${parts.join(', ')}.`
}

export function ManageUserAccessPanel({
  userId,
  userEmail,
  isDeactivated,
  canDeactivate,
  canHardDelete,
  isSelf,
  isLastPlatformOwner,
  ownedInventory,
  reassignCandidates,
}: ManageUserAccessPanelProps) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [reassignToUserId, setReassignToUserId] = useState('')
  const [typedEmail, setTypedEmail] = useState('')
  const [isPending, startTransition] = useTransition()

  const inventoryText = useMemo(
    () => inventorySentence(ownedInventory),
    [ownedInventory],
  )

  if (!canDeactivate) return null

  // Destructive controls are blocked for self-removal and for the last
  // platform owner; surface a reason rather than silently disabling.
  const blockReason = isSelf
    ? 'You cannot deactivate your own account'
    : isLastPlatformOwner
      ? 'Cannot remove the last platform owner'
      : null
  const blocked = blockReason !== null

  function runAction(fn: () => Promise<unknown>, fallbackMessage: string) {
    startTransition(async () => {
      try {
        await fn()
        toast.success('Done.')
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : fallbackMessage
        toast.error(message)
      }
    })
  }

  function confirmDeactivate() {
    setConfirmOpen(false)
    runAction(
      () => deactivateUserAction({ userId }),
      'Could not deactivate the user',
    )
  }

  function reactivate() {
    runAction(
      () => reactivateUserAction({ userId }),
      'Could not reactivate the user',
    )
  }

  const emailMatches = typedEmail === userEmail
  const canSubmitDelete =
    !blocked &&
    !isPending &&
    reassignToUserId !== '' &&
    emailMatches

  function hardDelete() {
    if (!canSubmitDelete) return
    runAction(
      () => hardDeleteUserAction({ userId, reassignToUserId }),
      'Could not delete the user',
    )
  }

  return (
    <div className="space-y-4">
      {!isDeactivated && (
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmOpen(true)}
            disabled={blocked || isPending}
          >
            Deactivate access
          </Button>
          {blockReason && (
            <p className="text-[13px] text-muted-foreground">{blockReason}</p>
          )}

          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Deactivate access</DialogTitle>
                <DialogDescription>
                  Deactivate {userEmail}? This signs them out and blocks
                  access. Reversible.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmOpen(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={confirmDeactivate}
                  disabled={isPending}
                >
                  Deactivate
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {isDeactivated && (
        <div className="space-y-4">
          <Button
            type="button"
            variant="outline"
            onClick={reactivate}
            disabled={isPending}
          >
            Reactivate access
          </Button>

          {canHardDelete && (
            <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-[13px] font-medium text-foreground">
                Permanently delete
              </p>
              <p className="text-[13px] text-muted-foreground">
                {inventoryText}
              </p>

              <label className="block text-[12px] font-medium text-foreground">
                Reassign work to
                <select
                  value={reassignToUserId}
                  onChange={(e) => setReassignToUserId(e.target.value)}
                  aria-label="Reassign to"
                  disabled={isPending}
                  className="mt-1 block w-full rounded border border-border bg-background px-2 py-1 text-[13px]"
                >
                  <option value="">Select a user…</option>
                  {reassignCandidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.email})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-[12px] font-medium text-foreground">
                Type the email to confirm
                <input
                  type="text"
                  value={typedEmail}
                  onChange={(e) => setTypedEmail(e.target.value)}
                  placeholder="Type the email to confirm"
                  disabled={isPending}
                  className="mt-1 block w-full rounded border border-border bg-background px-2 py-1 text-[13px]"
                />
              </label>

              <Button
                type="button"
                variant="destructive"
                onClick={hardDelete}
                disabled={!canSubmitDelete}
              >
                {isPending ? 'Deleting…' : 'Permanently delete'}
              </Button>
              {blockReason && (
                <p className="text-[13px] text-muted-foreground">
                  {blockReason}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ManageUserAccessPanel
