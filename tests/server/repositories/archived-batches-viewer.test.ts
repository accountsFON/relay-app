import { describe, it, expect, vi, beforeEach } from 'vitest'

const batchFindMany = vi.fn()
const clientFindMany = vi.fn()
vi.mock('@/db/client', () => ({
  db: {
    batch: { onlyArchived: () => ({ findMany: batchFindMany }) },
    client: { withArchived: () => ({ findMany: clientFindMany }) },
  },
}))

import { listArchivedBatchesForViewer } from '@/server/repositories/batches'

beforeEach(() => {
  vi.clearAllMocks()
  batchFindMany.mockResolvedValue([
    { id: 'b1', clientId: 'c1', label: 'June 2026', createdAt: new Date('2026-06-01'), deletedAt: new Date('2026-06-02') },
  ])
  clientFindMany.mockResolvedValue([{ id: 'c1', name: 'Brothers Marine' }])
})

describe('listArchivedBatchesForViewer', () => {
  it('admin: scopes to org only (no assignedAm filter) and joins client names', async () => {
    const rows = await listArchivedBatchesForViewer({ role: 'admin', platformOwner: false, organizationDbId: 'org1', userDbId: 'u1' } as never)
    const where = batchFindMany.mock.calls[0][0].where
    expect(where.client).toEqual({ organizationId: 'org1' })
    expect(rows[0]).toMatchObject({ id: 'b1', clientName: 'Brothers Marine', label: 'June 2026' })
  })

  it('account_manager: adds assignedAmId scope', async () => {
    await listArchivedBatchesForViewer({ role: 'account_manager', platformOwner: false, organizationDbId: 'org1', userDbId: 'u1' } as never)
    expect(batchFindMany.mock.calls[0][0].where.client).toEqual({ organizationId: 'org1', assignedAmId: 'u1' })
  })

  it('platform owner: org-only scope even if role is account_manager', async () => {
    await listArchivedBatchesForViewer({ role: 'account_manager', platformOwner: true, organizationDbId: 'org1', userDbId: 'u1' } as never)
    expect(batchFindMany.mock.calls[0][0].where.client).toEqual({ organizationId: 'org1' })
  })
})
