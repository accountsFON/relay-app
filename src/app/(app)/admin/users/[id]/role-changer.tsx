'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { changeUserRole } from './actions'
import type { UserRole } from '@/lib/types'

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  account_manager: 'AM',
  designer: 'Designer',
  client: 'Client',
}

type Props = {
  userId: string
  currentRole: UserRole
  isSelf: boolean
}

export function RoleChanger({ userId, currentRole, isSelf }: Props) {
  const [selected, setSelected] = useState<UserRole>(currentRole)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const dirty = selected !== currentRole

  const onSave = () => {
    setError(null)
    startTransition(async () => {
      try {
        await changeUserRole(userId, selected)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to change role')
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value as UserRole)}
        disabled={isPending}
        className="rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => (
          <option
            key={role}
            value={role}
            disabled={isSelf && role !== 'admin'}
          >
            {ROLE_LABELS[role]}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        variant={dirty ? 'default' : 'outline'}
        onClick={onSave}
        disabled={!dirty || isPending}
      >
        {isPending ? 'Saving…' : 'Change role'}
      </Button>
      {isSelf && (
        <span className="text-xs text-muted-foreground">
          (Cannot demote yourself)
        </span>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
