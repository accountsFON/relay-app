import { redirect } from 'next/navigation'
import type { OrgContext } from '@/lib/types'
import { requireOrgContext } from '@/server/middleware/auth'
import {
  can,
  type PermissionKey,
} from '@/server/auth/permissions'

/**
 * Asserts the current user has `action`. On failure, redirects to /no-access
 * (Next.js routes redirect through a special throw that server components
 * render as a 307, and that server actions / route handlers translate into
 * a client side redirect, so this works in either context).
 *
 * Used by both server components (page.tsx) and server actions; the
 * redirect-on-fail pattern matches requireOrgContext (which redirects on
 * missing org / missing membership).
 */
export async function requireCan(action: PermissionKey): Promise<OrgContext> {
  const ctx = await requireOrgContext()
  if (!can(ctx, action)) {
    redirect('/no-access')
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

export async function requirePostMediaEditor() {
  return requireCan('post.media.edit')
}

export function canUploadPostMedia(ctx: OrgContext): boolean {
  return can(ctx, 'post.media.edit')
}
