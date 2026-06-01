'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { setClientPrimary } from './actions'

type Option = { id: string; name: string }

type Props = {
  clientId: string
  clientName: string
  slot: 'am' | 'designer'
  currentUserId: string | null
  options: Option[]
}

export function AssignmentSelect({
  clientId,
  clientName,
  slot,
  currentUserId,
  options,
}: Props) {
  const [isPending, startTransition] = useTransition()

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value
    const userId = next === '' ? null : next

    startTransition(async () => {
      try {
        await setClientPrimary({ clientId, slot, userId })
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Failed to update assignment',
        )
      }
    })
  }

  const label = `Assign ${slot === 'am' ? 'account manager' : 'designer'} for ${clientName}`

  return (
    <select
      aria-label={label}
      value={currentUserId ?? ''}
      onChange={onChange}
      disabled={isPending}
      className="rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <option value="">Unassigned</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  )
}
