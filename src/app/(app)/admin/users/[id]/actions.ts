'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminPortal } from '@/server/middleware/permissions'
import {
  assignClientAm,
  assignClientDesigner,
} from '@/server/repositories/clients'
import {
  updateUserRole,
  findUserInOrg,
  updateUserPermissionOverrides,
} from '@/server/repositories/users'
import { recordPermissionAudits } from '@/server/repositories/permissionAuditLogs'
import {
  PERMISSION_KEYS,
  type PermissionKey,
} from '@/server/auth/permissions'
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

/**
 * Replaces the user's permissionOverrides map with the desired one.
 * Pass `null` for a key to clear that override (revert to role default).
 * Audits every key whose effective override changed.
 */
export async function updateUserPermissions(input: {
  userId: string
  overrides: Partial<Record<PermissionKey, boolean | null>>
}) {
  const ctx = await requireAdminPortal()

  const target = await findUserInOrg(input.userId, ctx.organizationDbId)
  if (!target) throw new Error('User not found')

  const current =
    (target.permissionOverrides as Record<string, boolean> | null) ?? {}

  // Build the new override map: null entries clear, defined entries set,
  // missing keys preserve the existing value.
  const next: Record<string, boolean> = {}
  for (const key of PERMISSION_KEYS) {
    const incoming = input.overrides[key]
    if (incoming === null) continue
    if (incoming === undefined) {
      if (key in current) next[key] = current[key]
      continue
    }
    next[key] = incoming
  }

  // Diff for audit
  const audits = []
  for (const key of PERMISSION_KEYS) {
    const before = key in current ? current[key] : null
    const after = key in next ? next[key] : null
    if (before === after) continue
    audits.push({
      organizationId: ctx.organizationDbId,
      actorUserId: ctx.userDbId,
      targetUserId: input.userId,
      targetRole: null,
      permissionKey: key,
      fromValue: before,
      toValue: after,
    })
  }

  const finalOverrides = Object.keys(next).length > 0 ? next : null

  await updateUserPermissionOverrides(
    input.userId,
    ctx.organizationDbId,
    finalOverrides,
  )
  await recordPermissionAudits(audits)

  revalidatePath(`/admin/users/${input.userId}`)
}
