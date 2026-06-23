import { db } from '@/db/client'

/**
 * True when the ContentRun has been cancelled by a user mid-flight. The
 * generate-content pipeline calls this before finalizing (so a cancelled run
 * never attaches posts or marks complete) and in its catch (so an aborted step
 * that throws is not re-labeled as a failure). The DB status is the source of
 * truth; the cancel action writes it.
 */
export async function isRunCancelled(contentRunId: string): Promise<boolean> {
  const run = await db.contentRun.findUnique({
    where: { id: contentRunId },
    select: { status: true },
  })
  return run?.status === 'cancelled'
}
