import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/middleware/permissions', () => ({ requireCan: vi.fn() }))
vi.mock('@/server/services/relay', () => ({
  finishBatch: vi.fn(), forceStep: vi.fn(), markDesignRevisionsDone: vi.fn(),
  passBaton: vi.fn(), requestDesignChanges: vi.fn(), sendBackBaton: vi.fn(),
}))
vi.mock('@/server/services/drive-upload', () => ({ uploadPostGraphicsToDrive: vi.fn() }))
vi.mock('@/server/services/nectr-schedule', () => ({ scheduleBatchToNectr: vi.fn() }))
vi.mock('@/db/client', () => ({ db: { batch: { findUnique: vi.fn() } } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/server/lib/relay-state-machine', () => ({ legalNextSteps: vi.fn(() => []) }))
vi.mock('@/lib/relay-holder-override', () => ({ canOverrideHolder: () => true }))
vi.mock('@/server/lib/notifyHolderOfBatonHandoff', () => ({ notifyHolderOfBatonHandoff: vi.fn() }))

import { finishBatchAction } from '@/server/actions/relay'
import { requireCan } from '@/server/middleware/permissions'
import { finishBatch } from '@/server/services/relay'
import { uploadPostGraphicsToDrive } from '@/server/services/drive-upload'
import { scheduleBatchToNectr } from '@/server/services/nectr-schedule'
import { db } from '@/db/client'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireCan).mockResolvedValue({ userDbId: 'u', organizationDbId: 'o', role: 'admin', platformOwner: true } as never)
  vi.mocked(db.batch.findUnique).mockResolvedValue({ id: 'b1', clientId: 'c1', currentHolder: 'u', client: { organizationId: 'o' } } as never)
  vi.mocked(finishBatch).mockResolvedValue({ ok: true } as never)
  vi.mocked(uploadPostGraphicsToDrive).mockResolvedValue({ status: 'skipped', reason: 'no-folder' } as never)
})

describe('finishBatchAction NECTR push', () => {
  it('runs scheduleBatchToNectr and returns its result on the payload', async () => {
    vi.mocked(scheduleBatchToNectr).mockResolvedValue({ status: 'ok', scheduled: 3, alreadyScheduled: 0, accounts: 2, failed: [] })
    const res = await finishBatchAction({ batchId: 'b1' })
    expect(scheduleBatchToNectr).toHaveBeenCalledWith('b1')
    expect(res.nectrSchedule).toEqual({ status: 'ok', scheduled: 3, alreadyScheduled: 0, accounts: 2, failed: [] })
  })

  it('swallows a NECTR push throw so the relay still completes', async () => {
    vi.mocked(scheduleBatchToNectr).mockRejectedValue(new Error('nectr down'))
    const res = await finishBatchAction({ batchId: 'b1' })
    expect(res.nectrSchedule).toBeNull()
    expect(res).toMatchObject({ ok: true })
  })
})
