'use server'

import { revalidatePath } from 'next/cache'
import { requireClientEditor } from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import { db } from '@/db/client'
import {
  createDesignerFlag,
  updateDesignerFlagNote,
  deleteDesignerFlag,
  findDesignerFlagForAuth,
} from '@/server/repositories/designerFlags'

export class DesignerFlagActionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DesignerFlagActionError'
  }
}

function revalidateReviewPaths(
  clientId: string,
  batchId: string,
  reviewSessionId: string,
): void {
  revalidatePath(`/clients/${clientId}/batches/${batchId}`)
  revalidatePath(
    `/clients/${clientId}/batches/${batchId}/review-sessions/${reviewSessionId}`,
  )
}

export async function flagFeedbackForDesignerAction(input: {
  postId: string
  reviewSessionId: string
  threadId?: string
  reviewItemId?: string
  note?: string
}): Promise<{ ok: true; flagId: string }> {
  const ctx = await requireClientEditor()

  const hasThread = Boolean(input.threadId)
  const hasItem = Boolean(input.reviewItemId)
  if (hasThread === hasItem) {
    throw new DesignerFlagActionError(
      'Exactly one of threadId or reviewItemId is required',
    )
  }

  const post = await db.post.findUnique({
    where: { id: input.postId },
    select: { id: true, clientId: true, batchId: true },
  })
  if (!post || !post.batchId) throw new DesignerFlagActionError('Post not found')

  const client = await findClientForUser(ctx, post.clientId)
  if (!client) throw new DesignerFlagActionError('Post not found')

  if (input.threadId) {
    const thread = await db.postThread.findUnique({
      where: { id: input.threadId },
      select: { id: true, postId: true },
    })
    if (!thread || thread.postId !== input.postId) {
      throw new DesignerFlagActionError('Thread does not belong to this post')
    }
  }

  if (input.reviewItemId) {
    const item = await db.reviewItem.findUnique({
      where: { id: input.reviewItemId },
      select: { id: true, postId: true },
    })
    if (!item || item.postId !== input.postId) {
      throw new DesignerFlagActionError('Review item does not belong to this post')
    }
  }

  const existing = await db.designerFlag.findFirst({
    where: {
      postId: input.postId,
      threadId: input.threadId ?? null,
      reviewItemId: input.reviewItemId ?? null,
    },
    select: { id: true },
  })

  let flagId: string
  if (existing) {
    await updateDesignerFlagNote(existing.id, input.note ?? null)
    flagId = existing.id
  } else {
    const created = await createDesignerFlag({
      batchId: post.batchId,
      postId: post.id,
      threadId: input.threadId ?? null,
      reviewItemId: input.reviewItemId ?? null,
      note: input.note ?? null,
      createdById: ctx.userDbId,
    })
    flagId = created.id
  }

  revalidateReviewPaths(post.clientId, post.batchId, input.reviewSessionId)
  return { ok: true, flagId }
}

export async function unflagFeedbackForDesignerAction(input: {
  flagId: string
  reviewSessionId: string
}): Promise<{ ok: true }> {
  const ctx = await requireClientEditor()
  const flag = await findDesignerFlagForAuth(input.flagId)
  if (!flag || flag.post.client.organizationId !== ctx.organizationDbId) {
    throw new DesignerFlagActionError('Flag not found')
  }
  await deleteDesignerFlag(flag.id)
  revalidateReviewPaths(flag.post.clientId, flag.batchId, input.reviewSessionId)
  return { ok: true }
}
