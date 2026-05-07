'use client'

import { useState, useTransition } from 'react'
import { setClientAssignment } from './actions'
import { Button } from '@/components/ui/button'

type Props = {
  userId: string
  clientId: string
  slot: 'am' | 'designer'
  currentAssigneeId: string | null
  currentAssigneeName: string | null
}

export function AssignmentToggle({
  userId,
  clientId,
  slot,
  currentAssigneeId,
  currentAssigneeName,
}: Props) {
  const isAssignedToThisUser = currentAssigneeId === userId
  const isAssignedElsewhere =
    currentAssigneeId !== null && currentAssigneeId !== userId

  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleToggle = () => {
    setError(null)

    if (isAssignedElsewhere) {
      const ok = confirm(
        `Reassign this client from ${currentAssigneeName ?? 'current owner'} to this user?`,
      )
      if (!ok) return
    }

    startTransition(async () => {
      try {
        await setClientAssignment({
          userId,
          clientId,
          slot,
          assigned: !isAssignedToThisUser,
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to update assignment')
      }
    })
  }

  let label: string
  let variant: 'default' | 'outline' | 'secondary' = 'outline'
  if (isAssignedToThisUser) {
    label = 'Assigned'
    variant = 'default'
  } else if (isAssignedElsewhere) {
    label = `Reassign from ${currentAssigneeName ?? 'other'}`
    variant = 'outline'
  } else {
    label = 'Assign'
    variant = 'secondary'
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant={variant}
        onClick={handleToggle}
        disabled={isPending}
      >
        {isPending ? '...' : label}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
