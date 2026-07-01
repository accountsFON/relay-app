import { db } from '@/db/client'
import { isRelayLocked } from '@/lib/relay-lock'

/** Thrown by post-edit paths when the post's relay is completed (locked). */
export class RelayCompletedError extends Error {
  constructor() {
    super('This relay is completed and locked; posts can no longer be edited.')
    this.name = 'RelayCompletedError'
  }
}

/**
 * Reject an edit when the post's batch is locked (completed). No-op when the
 * post has no batch yet (generation in flight) or the batch row is missing.
 * Shared by every post-mutating server entry point so the completed lock is
 * enforced server-side, not just in the UI.
 */
export async function assertBatchEditable(
  batchId: string | null | undefined,
): Promise<void> {
  if (!batchId) return
  const batch = await db.batch.findUnique({
    where: { id: batchId },
    select: { currentStep: true },
  })
  if (batch && isRelayLocked(batch.currentStep)) {
    throw new RelayCompletedError()
  }
}
