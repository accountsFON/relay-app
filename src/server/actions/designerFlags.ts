'use server'

import { revalidatePath } from 'next/cache'
import { requireClientEditor, requireCan } from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import { db } from '@/db/client'
import {
  createDesignerFlag,
  updateDesignerFlagNote,
  deleteDesignerFlag,
  findDesignerFlagForAuth,
  setDesignerFlagDone,
} from '@/server/repositories/designerFlags'
import { sendFlaggedFeedbackToDesigner, markClientRevisionDesignDone } from '@/server/services/relay'
import { canOverrideHolder } from '@/lib/relay-holder-override'

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

export async function sendFlaggedFeedbackToDesignerAction(input: {
  batchId: string
  reviewSessionId: string
}): Promise<{ ok: true; count: number }> {
  const ctx = await requireClientEditor()
  const batch = await db.batch.findUnique({
    where: { id: input.batchId },
    select: { clientId: true, client: { select: { organizationId: true } } },
  })
  if (!batch || batch.client.organizationId !== ctx.organizationDbId) {
    throw new DesignerFlagActionError('Relay not found')
  }
  const result = await sendFlaggedFeedbackToDesigner({
    batchId: input.batchId,
    actorId: ctx.userDbId,
    actorOrganizationId: ctx.organizationDbId,
  })
  revalidateReviewPaths(batch.clientId, input.batchId, input.reviewSessionId)
  revalidatePath('/dashboard')
  revalidatePath('/inbox')
  return { ok: true, count: result.count }
}

async function toggleFlagDone(
  input: { flagId: string; reviewSessionId: string },
  done: boolean,
): Promise<{ ok: true }> {
  const ctx = await requireCan('relay.pass')
  const flag = await db.designerFlag.findUnique({
    where: { id: input.flagId },
    select: {
      id: true,
      batchId: true,
      post: {
        select: {
          clientId: true,
          client: {
            select: { organizationId: true, assignedDesignerId: true },
          },
        },
      },
      batch: { select: { currentHolder: true } },
    },
  })
  if (!flag || flag.post.client.organizationId !== ctx.organizationDbId) {
    throw new DesignerFlagActionError('Flag not found')
  }
  const isDesigner = ctx.userDbId === flag.post.client.assignedDesignerId
  const isHolder = ctx.userDbId === flag.batch.currentHolder
  if (!isDesigner && !isHolder && !canOverrideHolder(ctx.role, ctx.platformOwner)) {
    throw new DesignerFlagActionError(
      'Only the assigned designer, an AM, or an admin can update this task.',
    )
  }
  await setDesignerFlagDone(flag.id, ctx.userDbId, done)
  revalidateReviewPaths(flag.post.clientId, flag.batchId, input.reviewSessionId)
  return { ok: true }
}

export async function setDesignerFlagDoneAction(input: {
  flagId: string
  reviewSessionId: string
}) {
  return toggleFlagDone(input, true)
}

export async function unsetDesignerFlagDoneAction(input: {
  flagId: string
  reviewSessionId: string
}) {
  return toggleFlagDone(input, false)
}

/**
 * Designer-held in-step action: the designer has finished every flagged task
 * during `implementing_revisions` and returns the relay to the AM.
 *
 * Permission gate: `relay.pass` (designer, AM, admin). Body authorization
 * narrows to the assigned designer OR current holder OR holder-override.
 * Mirror of `markDesignRevisionsDoneAction` (relay.ts) with step guard
 * changed to `implementing_revisions`.
 */
export async function markClientRevisionDesignDoneAction(input: { batchId: string }) {
  const ctx = await requireCan('relay.pass')

  const batch = await db.batch.findUnique({
    where: { id: input.batchId },
    select: {
      currentHolder: true,
      clientId: true,
      client: { select: { organizationId: true, assignedDesignerId: true } },
    },
  })
  if (!batch || batch.client.organizationId !== ctx.organizationDbId) {
    throw new Error('Relay not found')
  }

  const isAssignedDesigner = ctx.userDbId === batch.client.assignedDesignerId
  const isHolder = ctx.userDbId === batch.currentHolder
  if (
    !isAssignedDesigner &&
    !isHolder &&
    !canOverrideHolder(ctx.role, ctx.platformOwner)
  ) {
    throw new Error(
      'Only the assigned designer, an AM, or an admin can mark revisions done.',
    )
  }

  const result = await markClientRevisionDesignDone({
    batchId: input.batchId,
    actorId: ctx.userDbId,
    actorOrganizationId: ctx.organizationDbId,
  })

  revalidatePath(`/clients/${batch.clientId}/batches/${input.batchId}`)
  revalidatePath('/dashboard')
  revalidatePath('/inbox')

  return result
}
