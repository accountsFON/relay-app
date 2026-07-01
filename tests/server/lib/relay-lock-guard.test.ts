import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/client', () => ({
  db: { batch: { findUnique: vi.fn() } },
}))

import { db } from '@/db/client'
import { assertBatchEditable, RelayCompletedError } from '@/server/lib/relay-lock-guard'

beforeEach(() => vi.clearAllMocks())

describe('assertBatchEditable', () => {
  it('throws RelayCompletedError when the batch is completed', async () => {
    ;(db.batch.findUnique as any).mockResolvedValue({ currentStep: 'completed' })
    await expect(assertBatchEditable('b1')).rejects.toBeInstanceOf(RelayCompletedError)
  })
  it('resolves when the batch is on a live step', async () => {
    ;(db.batch.findUnique as any).mockResolvedValue({ currentStep: 'scheduling' })
    await expect(assertBatchEditable('b1')).resolves.toBeUndefined()
  })
  it('is a no-op (no query) when batchId is null', async () => {
    await assertBatchEditable(null)
    expect(db.batch.findUnique).not.toHaveBeenCalled()
  })
  it('resolves when the batch row is missing', async () => {
    ;(db.batch.findUnique as any).mockResolvedValue(null)
    await expect(assertBatchEditable('b1')).resolves.toBeUndefined()
  })
})
