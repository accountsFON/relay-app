/**
 * ClientTeamHeader — surfaces who owns this client (AM + Designer) at the
 * top of the client detail page. When the viewer has admin.portal they can
 * reassign inline; otherwise the names render read-only.
 *
 * Reassign reuses the existing `setClientPrimary` server action, the same
 * one /admin/clients drives the dropdowns from. This component is the
 * client-page counterpart so admins don't have to detour through the admin
 * portal just to swap team members.
 */
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserCircle2 } from 'lucide-react'
import { setClientPrimary } from '@/app/(app)/admin/clients/actions'

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
      <div className="hidden h-8 w-px shrink-0 bg-cream-80 sm:block" />
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

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value
    const userId = next === '' ? null : next
    startTransition(async () => {
      try {
        await setClientPrimary({ clientId, slot, userId })
        router.refresh()
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to reassign')
      }
    })
  }

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
          <div className="flex size-9 items-center justify-center rounded-full bg-cream-warm text-muted-foreground">
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
            aria-label={`Reassign ${slotLabel.toLowerCase()} for ${clientName}`}
            value={current?.id ?? ''}
            onChange={onChange}
            disabled={isPending}
            className="-ml-1 max-w-full rounded-md bg-transparent px-1 py-0.5 text-[14px] font-medium text-foreground hover:bg-cream-warm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">— Unassigned —</option>
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
    </div>
  )
}
