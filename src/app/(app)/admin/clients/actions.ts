'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminPortal } from '@/server/middleware/permissions'
import {
  assignClientAm,
  assignClientDesigner,
} from '@/server/repositories/clients'
import { findMembership } from '@/server/repositories/memberships'
import { recordActivity, ActivityKind } from '@/server/services/activity'
import { db } from '@/db/client'

/**
 * Sets or clears the AM/Designer slot on a client. Pass userId='' to clear.
 * Validates that the target user (when set) is in the same org.
 */
export async function setClientPrimary(input: {
  clientId: string
  slot: 'am' | 'designer'
  userId: string | null
}) {
  const ctx = await requireAdminPortal()

  let assigneeName: string | null = null
  if (input.userId) {
    const membership = await findMembership(input.userId, ctx.organizationDbId)
    if (!membership) throw new Error('User is not a member of this agency')
    const user = await db.user.findUnique({
      where: { id: input.userId },
      select: { name: true },
    })
    assigneeName = user?.name ?? null
  }

  if (input.slot === 'am') {
    await assignClientAm(input.clientId, ctx.organizationDbId, input.userId)
  } else {
    await assignClientDesigner(
      input.clientId,
      ctx.organizationDbId,
      input.userId,
    )
  }

  const kind = input.userId
    ? input.slot === 'am'
      ? ActivityKind.client_am_assigned
      : ActivityKind.client_designer_assigned
    : input.slot === 'am'
      ? ActivityKind.client_am_unassigned
      : ActivityKind.client_designer_unassigned
  await recordActivity({
    clientId: input.clientId,
    actorId: ctx.userDbId,
    kind,
    payload: input.userId
      ? { assignedToId: input.userId, assignedToName: assigneeName }
      : {},
  })

  revalidatePath('/admin/clients')
  revalidatePath('/admin/users')
}
