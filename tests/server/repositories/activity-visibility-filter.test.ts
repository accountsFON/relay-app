import { describe, it, expect } from 'vitest'
import { EventVisibility, UserRole } from '@prisma/client'
import { visibilityForViewer } from '@/server/repositories/activityEvents'
import type { OrgContext } from '@/lib/types'

function ctx(overrides: Partial<OrgContext>): OrgContext {
  return {
    orgId: 'org_1',
    organizationDbId: 'cuid_org_1',
    userDbId: 'cuid_user_1',
    role: UserRole.account_manager,
    platformOwner: false,
    linkedClientId: null,
    roleDefaults: {},
    ...overrides,
  } as OrgContext
}

describe('visibilityForViewer', () => {
  it('client role sees public only', () => {
    expect(visibilityForViewer(ctx({ role: UserRole.client }))).toEqual([
      EventVisibility.public,
    ])
  })

  it('account_manager sees public + internal', () => {
    expect(visibilityForViewer(ctx({ role: UserRole.account_manager }))).toEqual([
      EventVisibility.public,
      EventVisibility.internal,
    ])
  })

  it('designer sees public + internal', () => {
    expect(visibilityForViewer(ctx({ role: UserRole.designer }))).toEqual([
      EventVisibility.public,
      EventVisibility.internal,
    ])
  })

  it('admin sees all three', () => {
    expect(visibilityForViewer(ctx({ role: UserRole.admin }))).toEqual([
      EventVisibility.public,
      EventVisibility.internal,
      EventVisibility.admin_only,
    ])
  })

  it('platform owner overrides role and sees all three', () => {
    expect(
      visibilityForViewer(ctx({ role: UserRole.client, platformOwner: true })),
    ).toEqual([
      EventVisibility.public,
      EventVisibility.internal,
      EventVisibility.admin_only,
    ])
  })
})
