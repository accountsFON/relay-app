'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminPortal } from '@/server/middleware/permissions'
import {
  assignClientAm,
  assignClientDesigner,
} from '@/server/repositories/clients'
import {
  findMembership,
  updateMembershipRole,
  updateMembershipPermissionOverrides,
} from '@/server/repositories/memberships'
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

  const membership = await findMembership(input.userId, ctx.organizationDbId)
  if (!membership) throw new Error('User is not a member of this agency')

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

export async function changeMembershipRole(userId: string, role: UserRole) {
  const ctx = await requireAdminPortal()

  if (userId === ctx.userDbId && role !== 'admin') {
    throw new Error('Cannot demote yourself out of admin role')
  }

  const membership = await findMembership(userId, ctx.organizationDbId)
  if (!membership) throw new Error('User is not a member of this agency')

  // Repo enforces the at-least-one-admin invariant.
  await updateMembershipRole(membership.id, role)

  revalidatePath(`/admin/users/${userId}`)
  revalidatePath('/admin/users')
}

/**
 * Replaces the membership's permissionOverrides with the desired map.
 * Pass `null` for a key to clear that override (revert to role default).
 * Audits every key whose effective override changed.
 */
export async function updateMembershipPermissions(input: {
  userId: string
  overrides: Partial<Record<PermissionKey, boolean | null>>
}) {
  const ctx = await requireAdminPortal()

  const membership = await findMembership(input.userId, ctx.organizationDbId)
  if (!membership) throw new Error('User is not a member of this agency')

  const current =
    (membership.permissionOverrides as Record<string, boolean> | null) ?? {}

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

  const audits = []
  for (const key of PERMISSION_KEYS) {
    const before = key in current ? current[key] : null
    const after = key in next ? next[key] : null
    if (before === after) continue
    audits.push({
      organizationId: ctx.organizationDbId,
      actorUserId: ctx.userDbId,
      targetUserId: input.userId,
      targetMembershipId: membership.id,
      targetRole: null,
      permissionKey: key,
      fromValue: before,
      toValue: after,
      usedPlatformOverride: ctx.platformOwner,
    })
  }

  const finalOverrides = Object.keys(next).length > 0 ? next : null

  await updateMembershipPermissionOverrides(membership.id, finalOverrides)
  await recordPermissionAudits(audits)

  revalidatePath(`/admin/users/${input.userId}`)
}
