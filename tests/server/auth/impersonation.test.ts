import { describe, it, expect } from 'vitest'
import {
  canInitiateImpersonation,
  isEligibleImpersonationTarget,
  type ImpersonationTarget,
} from '@/server/auth/impersonation'
import type { OrgContext } from '@/lib/types'

function ctx(overrides: Partial<OrgContext> = {}): OrgContext {
  return {
    userId: 'clerk_admin',
    orgId: 'clerk_org_1',
    role: 'admin',
    plan: 'smb',
    organizationDbId: 'org_1',
    userDbId: 'admin_1',
    avatarUrl: null,
    platformOwner: false,
    linkedClientId: null,
    permissionOverrides: null,
    roleDefaults: {},
    ...overrides,
  }
}

function target(overrides: Partial<ImpersonationTarget> = {}): ImpersonationTarget {
  return {
    userId: 'payton_1',
    role: 'account_manager',
    deactivatedAt: null,
    platformOwner: false,
    organizationDbId: 'org_1',
    ...overrides,
  }
}

describe('canInitiateImpersonation', () => {
  it('allows an admin', () => {
    expect(canInitiateImpersonation(ctx({ role: 'admin' }))).toBe(true)
  })
  it('allows a platform owner of any role', () => {
    expect(canInitiateImpersonation(ctx({ role: 'designer', platformOwner: true }))).toBe(true)
  })
  it('rejects a non-admin', () => {
    expect(canInitiateImpersonation(ctx({ role: 'account_manager' }))).toBe(false)
  })
  it('rejects a context that is already impersonating', () => {
    expect(
      canInitiateImpersonation(
        ctx({ impersonation: { realUserId: 'a', realUserName: 'A', targetUserName: 'B' } }),
      ),
    ).toBe(false)
  })
})

describe('isEligibleImpersonationTarget', () => {
  it('accepts a non-admin in the admin\'s org', () => {
    expect(isEligibleImpersonationTarget(ctx(), target())).toBe(true)
  })
  it('accepts a client target', () => {
    expect(isEligibleImpersonationTarget(ctx(), target({ role: 'client' }))).toBe(true)
  })
  it('rejects another admin', () => {
    expect(isEligibleImpersonationTarget(ctx(), target({ role: 'admin' }))).toBe(false)
  })
  it('rejects a platform owner target', () => {
    expect(isEligibleImpersonationTarget(ctx(), target({ platformOwner: true }))).toBe(false)
  })
  it('rejects a deactivated target', () => {
    expect(isEligibleImpersonationTarget(ctx(), target({ deactivatedAt: new Date() }))).toBe(false)
  })
  it('rejects self', () => {
    expect(isEligibleImpersonationTarget(ctx({ userDbId: 'payton_1' }), target())).toBe(false)
  })
  it('rejects an out-of-org target for a non-platform-owner admin', () => {
    expect(isEligibleImpersonationTarget(ctx(), target({ organizationDbId: 'org_2' }))).toBe(false)
  })
  it('allows a cross-org target for a platform owner', () => {
    expect(
      isEligibleImpersonationTarget(ctx({ platformOwner: true }), target({ organizationDbId: 'org_2' })),
    ).toBe(true)
  })
  it('rejects when the initiator cannot impersonate at all', () => {
    expect(isEligibleImpersonationTarget(ctx({ role: 'designer' }), target())).toBe(false)
  })
})
