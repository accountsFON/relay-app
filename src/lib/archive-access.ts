import type { OrgContext } from '@/lib/types'

/** Who may see the Archive page + nav link: admins, account managers, platform owners. */
export function isArchiveViewer(ctx: Pick<OrgContext, 'role' | 'platformOwner'>): boolean {
  return ctx.platformOwner || ctx.role === 'admin' || ctx.role === 'account_manager'
}
