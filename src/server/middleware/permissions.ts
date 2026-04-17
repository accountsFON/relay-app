import type { UserRole } from '@/lib/types'
import { requireOrgContext } from '@/server/middleware/auth'

const EDITOR_ROLES: UserRole[] = ['admin', 'account_manager']
const VIEWER_ROLES: UserRole[] = ['admin', 'account_manager', 'designer']

export function canEditClients(role: UserRole): boolean {
  return EDITOR_ROLES.includes(role)
}

export function canViewClients(role: UserRole): boolean {
  return VIEWER_ROLES.includes(role)
}

export async function requireClientEditor() {
  const ctx = await requireOrgContext()
  if (!canEditClients(ctx.role)) {
    throw new Error('Forbidden: client editor role required')
  }
  return ctx
}

export async function requireClientViewer() {
  const ctx = await requireOrgContext()
  if (!canViewClients(ctx.role)) {
    throw new Error('Forbidden: client role cannot view /clients')
  }
  return ctx
}
