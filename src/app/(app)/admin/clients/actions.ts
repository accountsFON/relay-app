'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminPortal } from '@/server/middleware/permissions'
import {
  assignClientAm,
  assignClientDesigner,
} from '@/server/repositories/clients'
import { findMembership } from '@/server/repositories/memberships'

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

  if (input.userId) {
    const membership = await findMembership(input.userId, ctx.organizationDbId)
    if (!membership) throw new Error('User is not a member of this agency')
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

  revalidatePath('/admin/clients')
  revalidatePath('/admin/users')
}
