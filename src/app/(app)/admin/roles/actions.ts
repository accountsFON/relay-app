'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminPortal } from '@/server/middleware/permissions'
import {
  listRoleDefaults,
  replaceRoleDefaultsForRole,
} from '@/server/repositories/roleDefaults'
import { recordPermissionAudits } from '@/server/repositories/permissionAuditLogs'
import {
  PERMISSION_KEYS,
  type PermissionKey,
} from '@/server/auth/permissions'
import type { UserRole } from '@/lib/types'

/**
 * Updates the org's role defaults for a single role. `overrides` contains
 * the desired sparse map; entries set to null clear the org default for
 * that key (revert to system default).
 */
export async function updateRoleDefaults(input: {
  role: UserRole
  overrides: Partial<Record<PermissionKey, boolean | null>>
}) {
  const ctx = await requireAdminPortal()

  const existing = await listRoleDefaults(ctx.organizationDbId)
  const currentForRole = new Map<string, boolean>()
  for (const r of existing) {
    if (r.role === input.role) currentForRole.set(r.permissionKey, r.allow)
  }

  const desired: { permissionKey: string; allow: boolean }[] = []
  const audits = []

  for (const key of PERMISSION_KEYS) {
    const incoming = input.overrides[key]
    const before = currentForRole.has(key) ? currentForRole.get(key)! : null
    let after: boolean | null
    if (incoming === undefined) {
      after = before
    } else if (incoming === null) {
      after = null
    } else {
      after = incoming
    }

    if (after !== null) {
      desired.push({ permissionKey: key, allow: after })
    }

    if (before !== after) {
      audits.push({
        organizationId: ctx.organizationDbId,
        actorUserId: ctx.userDbId,
        targetUserId: null,
        targetRole: input.role,
        permissionKey: key,
        fromValue: before,
        toValue: after,
      })
    }
  }

  await replaceRoleDefaultsForRole(
    ctx.organizationDbId,
    input.role,
    desired,
  )
  await recordPermissionAudits(audits)

  revalidatePath('/admin/roles')
  revalidatePath('/admin/users')
}
