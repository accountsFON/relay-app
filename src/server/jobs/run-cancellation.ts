import type { Prisma } from '@prisma/client'
import { db } from '@/db/client'

/**
 * True when the ContentRun has been cancelled by a user mid-flight. The
 * generate-content pipeline calls this in its catch (so an aborted step that
 * throws is not re-labeled as a failure). The DB status is the source of
 * truth; the cancel action writes it.
 */
export async function isRunCancelled(contentRunId: string): Promise<boolean> {
  const run = await db.contentRun.findUnique({
    where: { id: contentRunId },
    select: { status: true },
  })
  return run?.status === 'cancelled'
}

/**
 * Atomically marks a run `complete` ONLY if it has not been cancelled. Returns
 * `false` (and writes nothing) when a cancel committed concurrently — closing
 * the TOCTOU window that a separate "read status, then update" pair would leave
 * open (a cancel landing between the read and the write could otherwise be
 * clobbered back to `complete`). The single `updateMany` makes the guard and
 * the write one statement. Callers MUST skip finalize / attach / notify when
 * this returns `false`. The caller supplies the cost/usage fields; this helper
 * owns the `status` and the guard.
 */
export async function markRunCompleteIfNotCancelled(
  contentRunId: string,
  data: Omit<Prisma.ContentRunUpdateManyMutationInput, 'status'>,
): Promise<boolean> {
  const res = await db.contentRun.updateMany({
    where: { id: contentRunId, status: { not: 'cancelled' } },
    data: { ...data, status: 'complete' },
  })
  return res.count > 0
}
