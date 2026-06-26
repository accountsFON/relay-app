import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { User, Organization, Membership } from '@prisma/client'

// --- Mock all dependencies of getOrgContext ---

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}))

vi.mock('@/server/repositories/users', () => ({
  findUserByClerkId: vi.fn(),
}))

vi.mock('@/server/repositories/organizations', () => ({
  findOrgByClerkId: vi.fn(),
}))

vi.mock('@/server/repositories/memberships', () => ({
  findMembership: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) }),
}))

vi.mock('@/db/client', () => ({
  db: {
    organization: { findUnique: vi.fn() },
    membership: { findFirst: vi.fn() },
    roleDefault: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findUnique: vi.fn() },
  },
}))

// --- Import after mocks are in place ---

import { auth } from '@clerk/nextjs/server'
import { findUserByClerkId } from '@/server/repositories/users'
import { findOrgByClerkId } from '@/server/repositories/organizations'
import { findMembership } from '@/server/repositories/memberships'
import { getOrgContext } from '@/server/middleware/auth'
import { VIEW_AS_COOKIE } from '@/server/auth/impersonation'
import { db } from '@/db/client'
import { cookies } from 'next/headers'

// --- Shared fixtures ---

const mockOrg: Organization = {
  id: 'db_org_1',
  name: 'Test Org',
  plan: 'smb',
  clerkOrgId: 'clerk_org_1',
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  runCredits: 0,
  reviewWindowDays: 7,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockMembership: Membership = {
  id: 'membership_1',
  userId: 'db_user_1',
  organizationId: 'db_org_1',
  role: 'admin',
  permissionOverrides: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const baseUser: User = {
  id: 'db_user_1',
  clerkUserId: 'clerk_x',
  organizationId: 'db_org_1',
  role: 'admin',
  email: 'test@example.com',
  name: 'Test User',
  avatarUrl: null,
  linkedClientId: null,
  permissionOverrides: null,
  platformOwner: false,
  deactivatedAt: null,
  createdAt: new Date(),
  onboardingTourSeenAt: null,
  launchPadDismissedAt: null,
  seenTours: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  // Restore a default cookies() stub so existing tests that don't set a
  // view-as cookie continue to work after applyViewAs was added to getOrgContext.
  vi.mocked(cookies).mockResolvedValue({
    get: vi.fn().mockReturnValue(undefined),
  } as never)
})

describe('getOrgContext() — deactivation gate', () => {
  /**
   * RED test: a user who would normally resolve a full OrgContext
   * (valid org + membership) must get null when deactivatedAt is set.
   *
   * Without the deactivation guard in auth.ts, this test fails because
   * the function would return a valid OrgContext instead of null.
   */
  it('returns null when the DB user has deactivatedAt set, even with a valid org and membership', async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: 'clerk_x',
      orgId: 'clerk_org_1',
    } as never)

    vi.mocked(findUserByClerkId).mockResolvedValue({
      ...baseUser,
      deactivatedAt: new Date(), // deactivated
    })

    // Wire up a complete org + membership so the only thing that can return
    // null is the deactivation gate itself.
    vi.mocked(findOrgByClerkId).mockResolvedValue(mockOrg)
    vi.mocked(findMembership).mockResolvedValue(mockMembership)

    const result = await getOrgContext()

    expect(result).toBeNull()
  })

  /**
   * Companion assertion: the same setup with deactivatedAt: null
   * should NOT return null — it should produce a valid OrgContext.
   */
  it('returns a valid OrgContext when deactivatedAt is null and the org + membership chain is complete', async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: 'clerk_x',
      orgId: 'clerk_org_1',
    } as never)

    vi.mocked(findUserByClerkId).mockResolvedValue({
      ...baseUser,
      deactivatedAt: null, // active user
    })

    vi.mocked(findOrgByClerkId).mockResolvedValue(mockOrg)
    vi.mocked(findMembership).mockResolvedValue(mockMembership)

    const result = await getOrgContext()

    expect(result).not.toBeNull()
    expect(result?.userDbId).toBe('db_user_1')
    expect(result?.orgId).toBe('clerk_org_1')
  })
})

describe('getOrgContext — view as', () => {
  const adminUser: User = { ...baseUser, id: 'admin_1', role: 'admin' }
  const paytonUser: User = {
    ...baseUser,
    id: 'payton_1',
    clerkUserId: 'clerk_payton',
    role: 'account_manager',
    name: 'Payton Monzon',
    email: 'payton@example.com',
    avatarUrl: null,
    platformOwner: false,
    deactivatedAt: null,
    organizationId: 'db_org_1',
  }
  const paytonMembership: Membership = {
    ...mockMembership,
    id: 'm_payton',
    userId: 'payton_1',
    role: 'account_manager',
  }

  function setCookie(value: string | undefined) {
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn((name: string) =>
        name === VIEW_AS_COOKIE && value ? { value } : undefined,
      ),
    } as never)
  }

  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue({ userId: 'clerk_admin', orgId: 'clerk_org_1' } as never)
    vi.mocked(findUserByClerkId).mockResolvedValue(adminUser as never)
    vi.mocked(findOrgByClerkId).mockResolvedValue(mockOrg as never)
    vi.mocked(findMembership).mockImplementation(async (userId: string) =>
      (userId === 'payton_1' ? paytonMembership : { ...mockMembership, userId: 'admin_1' }) as never,
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(db.user.findUnique as any).mockImplementation(async (args: any) =>
      args.where.id === 'payton_1' ? paytonUser : { ...adminUser, name: 'FON Admin' },
    )
    vi.mocked(db.organization.findUnique).mockResolvedValue(mockOrg as never)
  })

  it('rebuilds the context as the target when an admin has a valid cookie', async () => {
    setCookie('payton_1')
    const ctx = await getOrgContext()
    expect(ctx?.userDbId).toBe('payton_1')
    expect(ctx?.role).toBe('account_manager')
    expect(ctx?.platformOwner).toBe(false)
    expect(ctx?.impersonation).toEqual({
      realUserId: 'admin_1',
      realUserName: 'FON Admin',
      targetUserName: 'Payton Monzon',
    })
  })

  it('ignores the cookie and stays the admin when no cookie is set', async () => {
    setCookie(undefined)
    const ctx = await getOrgContext()
    expect(ctx?.userDbId).toBe('admin_1')
    expect(ctx?.impersonation).toBeFalsy()
  })

  it('ignores the cookie when the real user is not an admin', async () => {
    vi.mocked(findMembership).mockImplementation(async (userId: string) =>
      (userId === 'payton_1'
        ? paytonMembership
        : { ...mockMembership, userId: 'admin_1', role: 'designer' }) as never,
    )
    setCookie('payton_1')
    const ctx = await getOrgContext()
    expect(ctx?.userDbId).toBe('admin_1')
    expect(ctx?.impersonation).toBeFalsy()
  })

  it('ignores the cookie when the target is another admin', async () => {
    vi.mocked(findMembership).mockImplementation(async (userId: string) =>
      (userId === 'payton_1'
        ? { ...paytonMembership, role: 'admin' }
        : { ...mockMembership, userId: 'admin_1' }) as never,
    )
    setCookie('payton_1')
    const ctx = await getOrgContext()
    expect(ctx?.userDbId).toBe('admin_1')
    expect(ctx?.impersonation).toBeFalsy()
  })

  it('ignores the cookie when the target is deactivated', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(db.user.findUnique as any).mockImplementation(async (args: any) =>
      args.where.id === 'payton_1'
        ? { ...paytonUser, deactivatedAt: new Date() }
        : { ...adminUser, name: 'FON Admin' },
    )
    setCookie('payton_1')
    const ctx = await getOrgContext()
    expect(ctx?.userDbId).toBe('admin_1')
    expect(ctx?.impersonation).toBeFalsy()
  })
})
