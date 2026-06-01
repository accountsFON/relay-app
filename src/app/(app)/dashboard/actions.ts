'use server'

import { revalidatePath } from 'next/cache'
import { requireClientEditor } from '@/server/middleware/permissions'
import { archiveBatch } from '@/server/repositories/batches'

const MAX_BULK_ARCHIVE = 100

/**
 * Bulk-archive multiple batches from the Select-mode UI on the My Relay
 * dashboard.
 *
 * - Empty input is a no-op (returns archivedCount 0)
 * - Hard cap of 100 ids per call as a safety rail
 * - Permission: requireClientEditor (same as the per-batch overflow menu's
 *   archiveBatchAction in /trash/actions.ts)
 * - Each archiveBatch call has its own internal transaction (post-cascade
 *   stamping is atomic per batch). The bulk loop is NOT one big transaction,
 *   Prisma cannot nest the transactions archiveBatch already starts. If batch
 *   N fails, batches 1..N-1 remain archived (recoverable via /admin/trash).
 *   `failed` contains the ids that errored so the UI can surface them.
 */
export async function bulkArchiveBatchesAction(
  batchIds: string[],
): Promise<{ archivedCount: number; failed: { batchId: string; error: string }[] }> {
  if (batchIds.length === 0) return { archivedCount: 0, failed: [] }
  if (batchIds.length > MAX_BULK_ARCHIVE) {
    throw new Error(
      `Bulk archive supports up to ${MAX_BULK_ARCHIVE} batches per call (got ${batchIds.length})`,
    )
  }

  const ctx = await requireClientEditor()

  let archivedCount = 0
  const failed: { batchId: string; error: string }[] = []
  for (const batchId of batchIds) {
    try {
      await archiveBatch({ batchId, actorUserId: ctx.userDbId })
      archivedCount += 1
    } catch (e) {
      failed.push({
        batchId,
        error: e instanceof Error ? e.message : 'Unknown error',
      })
    }
  }

  revalidatePath('/clients', 'layout')
  revalidatePath('/dashboard')
  return { archivedCount, failed }
}
