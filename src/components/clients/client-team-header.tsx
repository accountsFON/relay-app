/**
 * ClientTeamHeader: surfaces who owns this client (AM + Designer) at the
 * top of the client detail page. When the viewer has admin.portal they can
 * reassign inline; otherwise the names render read-only.
 *
 * Reassign reuses the existing `setClientPrimary` server action, the same
 * one /admin/clients drives the dropdowns from. This component is the
 * client-page counterpart so admins don't have to detour through the admin
 * portal just to swap team members.
 *
 * Reassigns are gated behind a confirmation dialog so a stray dropdown click
 * doesn't silently flip the team on a live client.
 */
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserCircle2 } from 'lucide-react'
import { setClientPrimary } from '@/app/(app)/admin/clients/actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface TeamUser {
  id: string
  name: string
  avatarUrl: string | null
}

export interface ClientTeamHeaderProps {
  clientId: string
  clientName: string
  am: TeamUser | null
  designer: TeamUser | null
  amOptions: { id: string; name: string }[]
  designerOptions: { id: string; name: string }[]
  /** True when the viewer is allowed to reassign (admin only). */
  canManage: boolean
}

export function ClientTeamHeader({
  clientId,
  clientName,
  am,
  designer,
  amOptions,
  designerOptions,
  canManage,
}: ClientTeamHeaderProps) {
  return (
    <section
      aria-label="Client team"
      className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl bg-card p-4 sm:p-5"
    >
      <TeamSlot
        clientId={clientId}
        clientName={clientName}
        slot="am"
        slotLabel="Account Manager"
        current={am}
        options={amOptions}
        canManage={canManage}
      />
      <div className="hidden h-8 w-px shrink-0 bg-neutral-200 sm:block" />
      <TeamSlot
        clientId={clientId}
        clientName={clientName}
        slot="designer"
        slotLabel="Designer"
        current={designer}
        options={designerOptions}
        canManage={canManage}
      />
    </section>
  )
}

function TeamSlot({
  clientId,
  clientName,
  slot,
  slotLabel,
  current,
  options,
  canManage,
}: {
  clientId: string
  clientName: string
  slot: 'am' | 'designer'
  slotLabel: string
  current: TeamUser | null
  options: { id: string; name: string }[]
  canManage: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // The select stays controlled by the saved value, plus a pending override
  // while a reassign dialog is open. We never fire the action until Confirm.
  const savedId = current?.id ?? ''
  const [pendingId, setPendingId] = useState<string | null>(null)

  const isOpen = pendingId !== null
  const selectValue = pendingId !== null ? pendingId : savedId

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value
    if (next === savedId) return
    setPendingId(next)
  }

  function cancel() {
    setPendingId(null)
  }

  function confirm() {
    if (pendingId === null) return
    const nextUserId = pendingId === '' ? null : pendingId
    startTransition(async () => {
      try {
        await setClientPrimary({ clientId, slot, userId: nextUserId })
        setPendingId(null)
        router.refresh()
      } catch (err) {
        setPendingId(null)
        alert(err instanceof Error ? err.message : 'Failed to reassign')
      }
    })
  }

  const oldName = current?.name ?? 'Unassigned'
  const newOption = pendingId !== null
    ? options.find((o) => o.id === pendingId)
    : undefined
  const newName = pendingId === '' ? 'Unassigned' : newOption?.name ?? ''

  const roleLower = slotLabel.toLowerCase()

  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="shrink-0">
        {current?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.avatarUrl}
            alt=""
            className="size-9 rounded-full object-cover"
          />
        ) : (
          <div className="flex size-9 items-center justify-center rounded-full bg-neutral-100 text-muted-foreground">
            <UserCircle2 className="size-5" />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {slotLabel}
        </p>
        {canManage ? (
          <select
            aria-label={`Reassign ${roleLower} for ${clientName}`}
            value={selectValue}
            onChange={onChange}
            disabled={isPending}
            className="-ml-1 max-w-full rounded-md bg-transparent px-1 py-0.5 text-[14px] font-medium text-foreground hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Unassigned</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-[14px] font-medium text-foreground truncate">
            {current?.name ?? 'Unassigned'}
          </p>
        )}
      </div>

      {canManage && (
        <Dialog
          open={isOpen}
          onOpenChange={(open) => {
            if (!open && !isPending) cancel()
          }}
        >
          <DialogContent
            className="sm:max-w-md"
            initialFocus={(): HTMLElement | null => {
              if (typeof document === 'undefined') return null
              return document.querySelector<HTMLElement>(
                `[data-confirm-reassign="${slot}"]`,
              )
            }}
            showCloseButton={false}
          >
            <DialogHeader>
              <DialogTitle>
                {`Reassign ${slotLabel} for ${clientName}?`}
              </DialogTitle>
              <DialogDescription>
                {`${oldName} will no longer be the ${roleLower} on this client. ${
                  newName || 'The new teammate'
                } will be notified.`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={cancel}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                data-confirm-reassign={slot}
                onClick={confirm}
                disabled={isPending}
              >
                {isPending ? 'Saving…' : 'Confirm'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
