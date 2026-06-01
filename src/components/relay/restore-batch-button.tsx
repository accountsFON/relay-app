'use client'

import { ArchivedBanner } from '@/components/relay/archived-banner'
import { restoreBatchAction } from '@/app/(app)/trash/actions'

interface Props {
  batchId: string
  archivedAt: Date
  archivedBy?: string | null
}

/**
 * RestoreBatchBanner: wraps ArchivedBanner with a pre-wired restore callback
 * for batches.
 *
 * Client component so it can import `restoreBatchAction` directly and close
 * over `batchId`, avoiding the need for an inline `'use server'` function
 * inside the server page component.
 */
export function RestoreBatchBanner({ batchId, archivedAt, archivedBy }: Props) {
  async function handleRestore() {
    await restoreBatchAction(batchId)
  }

  return (
    <ArchivedBanner
      entityType="Relay"
      archivedAt={archivedAt}
      archivedBy={archivedBy}
      onRestore={handleRestore}
    />
  )
}
