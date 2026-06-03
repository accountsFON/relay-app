'use server'

import { requireOrgContext } from '@/server/middleware/auth'
import { selfDeactivateUser } from '@/server/services/users'

/**
 * Close (self deactivate) the current user's own account. No permission key:
 * any signed in user may act on their own account. The guard inside
 * selfDeactivateUser blocks the last admin / last platform owner. The client
 * signs the user out on success.
 */
export async function closeMyAccountAction() {
  const ctx = await requireOrgContext()
  return selfDeactivateUser({
    actorId: ctx.userDbId,
    actorOrganizationId: ctx.organizationDbId,
    actorIsPlatformOwner: ctx.platformOwner,
  })
}
