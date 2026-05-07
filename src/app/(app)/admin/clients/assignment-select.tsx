'use client'

import { useTransition } from 'react'
import { setClientPrimary } from './actions'

type Option = { id: string; name: string }

type Props = {
  clientId: string
  slot: 'am' | 'designer'
  currentUserId: string | null
  options: Option[]
}

export function AssignmentSelect({
  clientId,
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
        alert(
          err instanceof Error ? err.message : 'Failed to update assignment',
        )
      }
    })
  }

  return (
    <select
      value={currentUserId ?? ''}
      onChange={onChange}
      disabled={isPending}
      className="rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <option value="">— Unassigned —</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  )
}
