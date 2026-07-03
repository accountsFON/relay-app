import { db } from '@/db/client'

export interface CreateDesignerFlagInput {
  batchId: string
  postId: string
  threadId?: string | null
  reviewItemId?: string | null
  note?: string | null
  createdById: string
}

export async function createDesignerFlag(
  input: CreateDesignerFlagInput,
): Promise<{ id: string }> {
  return db.designerFlag.create({
    data: {
      batchId: input.batchId,
      postId: input.postId,
      threadId: input.threadId ?? null,
      reviewItemId: input.reviewItemId ?? null,
      note: input.note ?? null,
      createdById: input.createdById,
    },
    select: { id: true },
  })
}

export async function updateDesignerFlagNote(
  id: string,
  note: string | null,
): Promise<void> {
  await db.designerFlag.update({ where: { id }, data: { note } })
}

export async function deleteDesignerFlag(id: string): Promise<void> {
  await db.designerFlag.delete({ where: { id } })
}

export async function setDesignerFlagDone(
  id: string,
  doneById: string,
  done: boolean,
): Promise<void> {
  await db.designerFlag.update({
    where: { id },
    data: done
      ? { doneAt: new Date(), doneById }
      : { doneAt: null, doneById: null },
  })
}

export async function listDesignerFlagsForBatch(batchId: string) {
  return db.designerFlag.findMany({
    where: { batchId },
    orderBy: { createdAt: 'asc' },
  })
}

export async function designerFlagCounts(
  batchId: string,
): Promise<{ total: number; open: number }> {
  const [total, open] = await Promise.all([
    db.designerFlag.count({ where: { batchId } }),
    db.designerFlag.count({ where: { batchId, doneAt: null } }),
  ])
  return { total, open }
}

export async function findDesignerFlagForAuth(id: string) {
  return db.designerFlag.findUnique({
    where: { id },
    select: {
      id: true,
      batchId: true,
      postId: true,
      post: {
        select: { clientId: true, client: { select: { organizationId: true } } },
      },
    },
  })
}
