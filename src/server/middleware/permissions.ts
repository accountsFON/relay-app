import type { OrgContext } from '@/lib/types'
import { requireOrgContext } from '@/server/middleware/auth'
import {
  can,
  type PermissionKey,
} from '@/server/auth/permissions'

/**
 * Throws Unauthorized/Forbidden errors based on permission checks.
 * Use in Server Actions and API routes.
 */
export async function requireCan(action: PermissionKey): Promise<OrgContext> {
  const ctx = await requireOrgContext()
  if (!can(ctx, action)) {
    throw new Error(`Forbidden: missing permission '${action}'`)
  }
  return ctx
}

export async function requireAdminPortal(): Promise<OrgContext> {
  return requireCan('admin.portal')
}

// --- Legacy helpers, kept for backwards-compat with existing call sites. ---
// Prefer requireCan(...) for new code.

export async function requireClientEditor() {
  return requireCan('client.edit')
}

export async function requireClientViewer() {
  return requireCan('client.view')
}

export function canEditClients(ctx: OrgContext): boolean {
  return can(ctx, 'client.edit')
}

export function canViewClients(ctx: OrgContext): boolean {
  return can(ctx, 'client.view')
}
