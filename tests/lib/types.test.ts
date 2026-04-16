import { describe, it, expect } from 'vitest'
import type { OrgContext, UserRole, Plan } from '@/lib/types'

describe('OrgContext type', () => {
  it('should have the expected shape', () => {
    const ctx: OrgContext = {
      userId: 'user_123',
      orgId: 'org_123',
      role: 'admin',
      plan: 'smb',
      organizationDbId: 'cluid123',
      userDbId: 'cluid456',
    }
    expect(ctx.role).toBe('admin')
    expect(ctx.plan).toBe('smb')
  })
})

describe('UserRole type', () => {
  it('covers all four roles', () => {
    const roles: UserRole[] = ['admin', 'account_manager', 'designer', 'client']
    expect(roles).toHaveLength(4)
  })
})

describe('Plan type', () => {
  it('covers all three plans', () => {
    const plans: Plan[] = ['smb', 'agency', 'enterprise']
    expect(plans).toHaveLength(3)
  })
})
