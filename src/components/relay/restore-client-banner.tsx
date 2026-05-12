'use client'

import { ArchivedBanner } from '@/components/relay/archived-banner'
import { restoreClientAction } from '@/app/(app)/trash/actions'

interface Props {
  clientId: string
  archivedAt: Date
  archivedBy?: string | null
}

/**
 * RestoreClientBanner — wraps ArchivedBanner with a pre-wired restore
 * callback for clients.
 *
 * Client component so it can import `restoreClientAction` directly and close
 * over `clientId` — avoiding the need for an inline `'use server'` function
 * inside the server page component.
 */
export function RestoreClientBanner({ clientId, archivedAt, archivedBy }: Props) {
  async function handleRestore() {
    await restoreClientAction(clientId)
  }

  return (
    <ArchivedBanner
      entityType="Client"
      archivedAt={archivedAt}
      archivedBy={archivedBy}
      onRestore={handleRestore}
    />
  )
}
