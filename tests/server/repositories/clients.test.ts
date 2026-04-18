import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Client } from '@prisma/client'

vi.mock('@/db/client', () => ({
  db: {
    client: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

import { db } from '@/db/client'
import {
  findClientById,
  listClientsByOrg,
  createClient,
  updateClient,
  archiveClient,
} from '@/server/repositories/clients'

const mockClient: Client = {
  id: 'cuid_client_1',
  organizationId: 'cuid_org_1',
  assignedAmId: null,
  name: 'Akkoo Coffee',
  businessSummary: 'Specialty coffee.',
  brandVoice: 'Warm',
  industry: 'Coffee',
  location: 'Addis Ababa',
  phone: null,
  mainCta: null,
  focus1: null,
  focus2: null,
  focus3: null,
  dos: null,
  donts: null,
  postingDays: 'Mon,Wed,Fri',
  postLength: null,
  urls: [],
  targetAudience: null,
  holidayHandling: 'Major-US',
  excludedDates: [],
  assetsFolderUrl: null,
  autoCrawl: 'always',
  crawledData: null,
  crawledDataAt: null,
  status: 'active',
  createdAt: new Date(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('findClientById', () => {
  it('returns the client scoped to org when found', async () => {
    vi.mocked(db.client.findFirst).mockResolvedValue(mockClient)

    const result = await findClientById('cuid_client_1', 'cuid_org_1')

    expect(db.client.findFirst).toHaveBeenCalledWith({
      where: { id: 'cuid_client_1', organizationId: 'cuid_org_1' },
    })
    expect(result).toEqual(mockClient)
  })

  it('returns null when not found', async () => {
    vi.mocked(db.client.findFirst).mockResolvedValue(null)
    const result = await findClientById('missing', 'cuid_org_1')
    expect(result).toBeNull()
  })
})

describe('listClientsByOrg', () => {
  it('returns clients filtered by org, sorted by name', async () => {
    vi.mocked(db.client.findMany).mockResolvedValue([mockClient])

    const result = await listClientsByOrg('cuid_org_1')

    expect(db.client.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'cuid_org_1' },
      orderBy: { name: 'asc' },
    })
    expect(result).toEqual([mockClient])
  })

  it('filters by status when provided', async () => {
    vi.mocked(db.client.findMany).mockResolvedValue([mockClient])

    await listClientsByOrg('cuid_org_1', { status: 'active' })

    expect(db.client.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'cuid_org_1', status: 'active' },
      orderBy: { name: 'asc' },
    })
  })
})

describe('createClient', () => {
  it('creates a client with the given org and input', async () => {
    vi.mocked(db.client.create).mockResolvedValue(mockClient)

    const result = await createClient({
      organizationId: 'cuid_org_1',
      name: 'Akkoo Coffee',
      postingDays: 'Mon,Wed,Fri',
      holidayHandling: 'Major-US',
      urls: [],
      excludedDates: [],
      status: 'active',
    })

    expect(db.client.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'cuid_org_1',
        name: 'Akkoo Coffee',
        postingDays: 'Mon,Wed,Fri',
        holidayHandling: 'Major-US',
        urls: [],
        excludedDates: [],
        status: 'active',
      },
    })
    expect(result).toEqual(mockClient)
  })
})

describe('updateClient', () => {
  it('updates a client scoped to org', async () => {
    vi.mocked(db.client.updateMany).mockResolvedValue({ count: 1 })

    await updateClient('cuid_client_1', 'cuid_org_1', {
      name: 'Akkoo Coffee Renamed',
    })

    expect(db.client.updateMany).toHaveBeenCalledWith({
      where: { id: 'cuid_client_1', organizationId: 'cuid_org_1' },
      data: { name: 'Akkoo Coffee Renamed' },
    })
  })
})

describe('archiveClient', () => {
  it('sets status to archived', async () => {
    vi.mocked(db.client.updateMany).mockResolvedValue({ count: 1 })

    await archiveClient('cuid_client_1', 'cuid_org_1')

    expect(db.client.updateMany).toHaveBeenCalledWith({
      where: { id: 'cuid_client_1', organizationId: 'cuid_org_1' },
      data: { status: 'archived' },
    })
  })
})
