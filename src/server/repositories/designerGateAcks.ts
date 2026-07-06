import { db } from '@/db/client'

/** Has this designer already cleared the onboarding gate for this batch? Org-scoped for the repo lint. */
export async function hasDesignerGateAck(
  organizationId: string,
  batchId: string,
  userId: string,
): Promise<boolean> {
  const row = await db.designerGateAck.findFirst({
    where: { organizationId, batchId, userId },
    select: { id: true },
  })
  return row !== null
}

/** Record that a designer cleared the gate. Idempotent on (batchId, userId). */
export async function upsertDesignerGateAck(input: {
  organizationId: string
  batchId: string
  userId: string
}): Promise<void> {
  await db.designerGateAck.upsert({
    where: { batchId_userId: { batchId: input.batchId, userId: input.userId } },
    create: {
      organizationId: input.organizationId,
      batchId: input.batchId,
      userId: input.userId,
    },
    update: {},
  })
}
