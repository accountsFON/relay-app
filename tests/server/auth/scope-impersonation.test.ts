import { describe, it, expect } from 'vitest'
import { getClientScopeFilter } from '@/server/auth/scope'
import type { OrgContext } from '@/lib/types'

function impersonatedCtx(role: OrgContext['role'], overrides: Partial<OrgContext> = {}): OrgContext {
  return {
    userId: 'clerk_admin', // real admin session
    orgId: 'clerk_org_1',
    role,
    plan: 'smb',
    organizationDbId: 'org_1',
    userDbId: 'target_1', // the TARGET's id
    avatarUrl: null,
    platformOwner: false, // forced false while impersonating
    linkedClientId: null,
    permissionOverrides: null,
    roleDefaults: {},
    impersonation: { realUserId: 'admin_1', realUserName: 'Admin', targetUserName: 'Target' },
    ...overrides,
  }
}

describe('getClientScopeFilter under impersonation', () => {
  it('an impersonated AM sees only clients where the TARGET is the AM', () => {
    expect(getClientScopeFilter(impersonatedCtx('account_manager'))).toEqual({
      assignedAmId: 'target_1',
    })
  })
  it('an impersonated designer sees only the TARGET\'s designed clients', () => {
    expect(getClientScopeFilter(impersonatedCtx('designer'))).toEqual({
      assignedDesignerId: 'target_1',
    })
  })
  it('an impersonated client sees only their one linked client', () => {
    expect(
      getClientScopeFilter(impersonatedCtx('client', { linkedClientId: 'client_9' })),
    ).toEqual({ id: 'client_9' })
  })
  it('platformOwner being false means no admin-wide bypass leaks through', () => {
    // If platformOwner had leaked true, this would be {} (all clients).
    expect(getClientScopeFilter(impersonatedCtx('account_manager'))).not.toEqual({})
  })
})
