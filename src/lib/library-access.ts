import type { OrgContext } from '@/lib/types'

/**
 * Who may see the /library Beta QA index + its nav link: admins, account
 * managers, platform owners. Designers and clients are bounced (P1 #15:
 * the library leaked internal routes/components to designers).
 */
export function canViewLibrary(ctx: Pick<OrgContext, 'role' | 'platformOwner'>): boolean {
  return ctx.platformOwner || ctx.role === 'admin' || ctx.role === 'account_manager'
}
