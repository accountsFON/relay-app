'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminPortal } from '@/server/middleware/permissions'
import {
  assignClientAm,
  assignClientDesigner,
} from '@/server/repositories/clients'
import { updateUserRole, findUserInOrg } from '@/server/repositories/users'
import type { UserRole } from '@/lib/types'

export async function setClientAssignment(input: {
  userId: string
  clientId: string
  slot: 'am' | 'designer'
  assigned: boolean
}) {
  const ctx = await requireAdminPortal()

  const target = await findUserInOrg(input.userId, ctx.organizationDbId)
  if (!target) throw new Error('User not found')

  const newValue = input.assigned ? input.userId : null

  if (input.slot === 'am') {
    await assignClientAm(input.clientId, ctx.organizationDbId, newValue)
  } else {
    await assignClientDesigner(input.clientId, ctx.organizationDbId, newValue)
  }

  revalidatePath(`/admin/users/${input.userId}`)
  revalidatePath('/admin/users')
  revalidatePath('/admin/clients')
}

export async function changeUserRole(userId: string, role: UserRole) {
  const ctx = await requireAdminPortal()

  if (userId === ctx.userDbId && role !== 'admin') {
    throw new Error('Cannot demote yourself out of admin role')
  }

  await updateUserRole(userId, ctx.organizationDbId, role)

  revalidatePath(`/admin/users/${userId}`)
  revalidatePath('/admin/users')
}
