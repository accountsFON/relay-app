// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hasCopyGateAck, upsertCopyGateAck } from '@/server/repositories/copyGateAcks'
import { db } from '@/db/client'

vi.mock('@/db/client', () => ({
  db: {
    copyGateAck: { findFirst: vi.fn(), upsert: vi.fn() },
  },
}))

const mockDb = db as unknown as {
  copyGateAck: { findFirst: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> }
}

beforeEach(() => vi.resetAllMocks())

describe('hasCopyGateAck', () => {
  it('returns true when a row exists and scopes the query by organizationId', async () => {
    mockDb.copyGateAck.findFirst.mockResolvedValue({ id: 'ack_1' })
    const result = await hasCopyGateAck('org_1', 'batch_1', 'user_1')
    expect(result).toBe(true)
    expect(mockDb.copyGateAck.findFirst).toHaveBeenCalledWith({
      where: { organizationId: 'org_1', batchId: 'batch_1', userId: 'user_1' },
      select: { id: true },
    })
  })

  it('returns false when no row exists', async () => {
    mockDb.copyGateAck.findFirst.mockResolvedValue(null)
    expect(await hasCopyGateAck('org_1', 'batch_1', 'user_1')).toBe(false)
  })
})

describe('upsertCopyGateAck', () => {
  it('upserts idempotently on the (batchId, userId) unique key', async () => {
    mockDb.copyGateAck.upsert.mockResolvedValue({ id: 'ack_1' })
    await upsertCopyGateAck({ organizationId: 'org_1', batchId: 'batch_1', userId: 'user_1' })
    expect(mockDb.copyGateAck.upsert).toHaveBeenCalledWith({
      where: { batchId_userId: { batchId: 'batch_1', userId: 'user_1' } },
      create: { organizationId: 'org_1', batchId: 'batch_1', userId: 'user_1' },
      update: {},
    })
  })
})
