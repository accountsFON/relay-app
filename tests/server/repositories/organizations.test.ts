import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Organization } from '@prisma/client'

// Mock the db client — we test query logic, not Prisma internals
vi.mock('@/db/client', () => ({
  db: {
    organization: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}))

import { db } from '@/db/client'
import {
  findOrgByClerkId,
  createOrganization,
} from '@/server/repositories/organizations'

const mockOrg: Organization = {
  id: 'cuid_org_1',
  name: 'Test Agency',
  plan: 'agency',
  clerkOrgId: 'org_clerk_123',
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  runCredits: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('findOrgByClerkId', () => {
  it('returns the organization when found', async () => {
    vi.mocked(db.organization.findUnique).mockResolvedValue(mockOrg)

    const result = await findOrgByClerkId('org_clerk_123')

    expect(db.organization.findUnique).toHaveBeenCalledWith({
      where: { clerkOrgId: 'org_clerk_123' },
    })
    expect(result).toEqual(mockOrg)
  })

  it('returns null when not found', async () => {
    vi.mocked(db.organization.findUnique).mockResolvedValue(null)

    const result = await findOrgByClerkId('org_nonexistent')

    expect(result).toBeNull()
  })
})

describe('createOrganization', () => {
  it('creates an org with the given clerkOrgId, name, and plan', async () => {
    vi.mocked(db.organization.create).mockResolvedValue(mockOrg)

    const result = await createOrganization({
      clerkOrgId: 'org_clerk_123',
      name: 'Test Agency',
      plan: 'agency',
    })

    expect(db.organization.create).toHaveBeenCalledWith({
      data: {
        clerkOrgId: 'org_clerk_123',
        name: 'Test Agency',
        plan: 'agency',
      },
    })
    expect(result).toEqual(mockOrg)
  })
})
