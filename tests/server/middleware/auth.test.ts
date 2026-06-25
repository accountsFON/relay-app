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
  },
}))

// --- Import after mocks are in place ---

import { auth } from '@clerk/nextjs/server'
import { findUserByClerkId } from '@/server/repositories/users'
import { findOrgByClerkId } from '@/server/repositories/organizations'
import { findMembership } from '@/server/repositories/memberships'
import { getOrgContext } from '@/server/middleware/auth'

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
