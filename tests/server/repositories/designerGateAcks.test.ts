// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hasDesignerGateAck, upsertDesignerGateAck } from '@/server/repositories/designerGateAcks'
import { db } from '@/db/client'

vi.mock('@/db/client', () => ({
  db: {
    designerGateAck: { findFirst: vi.fn(), upsert: vi.fn() },
  },
}))

const mockDb = db as unknown as {
  designerGateAck: { findFirst: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> }
}

beforeEach(() => vi.resetAllMocks())

describe('hasDesignerGateAck', () => {
  it('returns true when a row exists and scopes the query by organizationId', async () => {
    mockDb.designerGateAck.findFirst.mockResolvedValue({ id: 'ack_1' })
    const result = await hasDesignerGateAck('org_1', 'batch_1', 'user_1')
    expect(result).toBe(true)
    expect(mockDb.designerGateAck.findFirst).toHaveBeenCalledWith({
      where: { organizationId: 'org_1', batchId: 'batch_1', userId: 'user_1' },
      select: { id: true },
    })
  })

  it('returns false when no row exists', async () => {
    mockDb.designerGateAck.findFirst.mockResolvedValue(null)
    expect(await hasDesignerGateAck('org_1', 'batch_1', 'user_1')).toBe(false)
  })
})

describe('upsertDesignerGateAck', () => {
  it('upserts idempotently on the (batchId, userId) unique key', async () => {
    mockDb.designerGateAck.upsert.mockResolvedValue({ id: 'ack_1' })
    await upsertDesignerGateAck({ organizationId: 'org_1', batchId: 'batch_1', userId: 'user_1' })
    expect(mockDb.designerGateAck.upsert).toHaveBeenCalledWith({
      where: { batchId_userId: { batchId: 'batch_1', userId: 'user_1' } },
      create: { organizationId: 'org_1', batchId: 'batch_1', userId: 'user_1' },
      update: {},
    })
  })
})
