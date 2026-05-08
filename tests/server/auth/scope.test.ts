import { describe, it, expect } from 'vitest'
import { getClientScopeFilter } from '@/server/auth/scope'
import type { OrgContext, UserRole } from '@/lib/types'

function makeCtx(role: UserRole, overrides: Partial<OrgContext> = {}): OrgContext {
  return {
    userId: 'u_clerk',
    orgId: 'o_clerk',
    role,
    plan: 'smb',
    organizationDbId: 'org_db',
    userDbId: 'user_db_42',
    platformOwner: false,
    linkedClientId: null,
    permissionOverrides: null,
    roleDefaults: {},
    ...overrides,
  }
}

describe('getClientScopeFilter()', () => {
  it('admin gets no extra filter', () => {
    expect(getClientScopeFilter(makeCtx('admin'))).toEqual({})
  })

  it('AM is filtered to their assigned clients', () => {
    const filter = getClientScopeFilter(makeCtx('account_manager'))
    expect(filter).toEqual({ assignedAmId: 'user_db_42' })
  })

  it('designer is filtered to their assigned clients', () => {
    const filter = getClientScopeFilter(makeCtx('designer'))
    expect(filter).toEqual({ assignedDesignerId: 'user_db_42' })
  })

  it('client without linkedClientId is locked out (impossible filter)', () => {
    const filter = getClientScopeFilter(makeCtx('client'))
    expect(filter).toEqual({ id: { in: [] } })
  })

  it('client with linkedClientId sees only their record', () => {
    const filter = getClientScopeFilter(
      makeCtx('client', { linkedClientId: 'client_db_99' }),
    )
    expect(filter).toEqual({ id: 'client_db_99' })
  })

  it('platformOwner returns empty filter regardless of role', () => {
    const filter = getClientScopeFilter(makeCtx('designer', { platformOwner: true }))
    expect(filter).toEqual({})
  })
})
