'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminPortal } from '@/server/middleware/permissions'
import {
  assignClientAm,
  assignClientDesigner,
} from '@/server/repositories/clients'
import { findUserInOrg } from '@/server/repositories/users'

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
    const target = await findUserInOrg(input.userId, ctx.organizationDbId)
    if (!target) throw new Error('User not found in this org')
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
