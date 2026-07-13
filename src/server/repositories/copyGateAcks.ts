import { db } from '@/db/client'

/** Has this AM/admin already cleared the copy-step onboarding gate for this batch? Org-scoped for the repo lint. */
export async function hasCopyGateAck(
  organizationId: string,
  batchId: string,
  userId: string,
): Promise<boolean> {
  const row = await db.copyGateAck.findFirst({
    where: { organizationId, batchId, userId },
    select: { id: true },
  })
  return row !== null
}

/** Record that an AM/admin cleared the copy gate. Idempotent on (batchId, userId). */
export async function upsertCopyGateAck(input: {
  organizationId: string
  batchId: string
  userId: string
}): Promise<void> {
  await db.copyGateAck.upsert({
    where: { batchId_userId: { batchId: input.batchId, userId: input.userId } },
    create: {
      organizationId: input.organizationId,
      batchId: input.batchId,
      userId: input.userId,
    },
    update: {},
  })
}
