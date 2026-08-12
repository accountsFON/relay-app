'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { checkNectrConnectionAction } from '@/app/(app)/clients/actions'
import type { NectrConnectionStatus } from '@/lib/nectr-social'

export function NectrConnectionCheck({ clientId }: { clientId: string }) {
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<NectrConnectionStatus | null>(null)

  const run = () => {
    startTransition(async () => {
      setStatus(await checkNectrConnectionAction(clientId))
    })
  }

  return (
    <div className="mt-2">
      <Button type="button" onClick={run} disabled={pending}>
        {pending ? 'Checking…' : 'Test connection'}
      </Button>
      {status && <ConnectionResult status={status} />}
    </div>
  )
}

function ConnectionResult({ status }: { status: NectrConnectionStatus }) {
  if (status.status === 'no-location') {
    return <p className="text-[12px] text-muted-foreground mt-2">No NECTR Location ID set for this client.</p>
  }
  if (status.status === 'not-configured') {
    return (
      <p className="text-[12px] text-muted-foreground mt-2">
        NECTR is not configured on the server (missing agency token).
      </p>
    )
  }
  if (status.status === 'error') {
    return <p className="text-[12px] text-destructive mt-2">Connection failed: {status.message}</p>
  }
  if (status.accounts.length === 0) {
    return (
      <p className="text-[12px] text-muted-foreground mt-2">
        Connected, but no social accounts are linked in NECTR yet.
      </p>
    )
  }
  return (
    <ul className="mt-2 space-y-1">
      {status.accounts.map((a) => (
        <li key={a.id} className="text-[12px]">
          <span className="font-medium capitalize">{a.platform}</span>: {a.name}{' '}
          {a.isExpired ? (
            <span className="text-destructive">(expired, reconnect in NECTR)</span>
          ) : (
            <span className="text-green-600">(live)</span>
          )}
        </li>
      ))}
    </ul>
  )
}
