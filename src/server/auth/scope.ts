import type { OrgContext } from '@/lib/types'
import type { Prisma } from '@prisma/client'

/**
 * Returns a Prisma where clause that scopes Client queries to what the
 * current user is allowed to see. Always combine with the org filter at
 * the call site (`{ organizationId, ...getClientScopeFilter(ctx) }`).
 *
 *   admin           → no extra filter
 *   account_manager → only clients where they are primary AM
 *   designer        → only clients where they are primary designer
 *   client          → only the single linked client (Stage 1+ feature)
 */
export function getClientScopeFilter(
  ctx: OrgContext,
): Prisma.ClientWhereInput {
  switch (ctx.role) {
    case 'admin':
      return {}
    case 'account_manager':
      return { assignedAmId: ctx.userDbId }
    case 'designer':
      return { assignedDesignerId: ctx.userDbId }
    case 'client':
      return ctx.linkedClientId ? { id: ctx.linkedClientId } : { id: '__none__' }
  }
}
