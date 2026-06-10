import { describe, it, expect } from 'vitest'
import type { OrgContext, UserRole } from '@/lib/types'
import {
  canEditClients,
  canViewClients,
} from '@/server/middleware/permissions'

function makeCtx(role: UserRole): OrgContext {
  return {
    userId: 'u_test',
    orgId: 'o_test',
    role,
    plan: 'smb',
    organizationDbId: 'org_db',
    userDbId: 'user_db',
    avatarUrl: null,
    platformOwner: false,
    linkedClientId: null,
    permissionOverrides: null,
    roleDefaults: {},
  }
}

describe('canEditClients', () => {
  it('returns true for admin', () => {
    expect(canEditClients(makeCtx('admin'))).toBe(true)
  })

  it('returns true for account_manager', () => {
    expect(canEditClients(makeCtx('account_manager'))).toBe(true)
  })

  it('returns false for designer', () => {
    expect(canEditClients(makeCtx('designer'))).toBe(false)
  })

  it('returns false for client', () => {
    expect(canEditClients(makeCtx('client'))).toBe(false)
  })
})

describe('canViewClients', () => {
  it('returns true for admin', () => {
    expect(canViewClients(makeCtx('admin'))).toBe(true)
  })

  it('returns true for account_manager', () => {
    expect(canViewClients(makeCtx('account_manager'))).toBe(true)
  })

  it('returns true for designer', () => {
    expect(canViewClients(makeCtx('designer'))).toBe(true)
  })

  it('returns true for client', () => {
    expect(canViewClients(makeCtx('client'))).toBe(true)
  })
})
