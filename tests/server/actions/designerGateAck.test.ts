// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { acknowledgeDesignerGateAction } from '@/server/actions/designerGateAck'
import { requireClientViewer } from '@/server/middleware/permissions'
import { findBatch } from '@/server/repositories/batches'
import { findClientForUser } from '@/server/repositories/clients'
import { upsertDesignerGateAck } from '@/server/repositories/designerGateAcks'
import { revalidatePath } from 'next/cache'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/server/middleware/permissions', () => ({ requireClientViewer: vi.fn() }))
vi.mock('@/server/repositories/batches', () => ({ findBatch: vi.fn() }))
vi.mock('@/server/repositories/clients', () => ({ findClientForUser: vi.fn() }))
vi.mock('@/server/repositories/designerGateAcks', () => ({ upsertDesignerGateAck: vi.fn() }))

const designerCtx = { role: 'designer', userDbId: 'user_1', organizationDbId: 'org_1' }

beforeEach(() => {
  vi.resetAllMocks()
  ;(requireClientViewer as ReturnType<typeof vi.fn>).mockResolvedValue(designerCtx)
  ;(findBatch as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'batch_1', clientId: 'client_1' })
  ;(findClientForUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'client_1' })
})

describe('acknowledgeDesignerGateAction', () => {
  it('upserts the ack and revalidates the batch page', async () => {
    const result = await acknowledgeDesignerGateAction('batch_1')
    expect(result).toEqual({ ok: true })
    expect(upsertDesignerGateAck).toHaveBeenCalledWith({
      organizationId: 'org_1',
      batchId: 'batch_1',
      userId: 'user_1',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/clients/client_1/batches/batch_1')
  })

  it('rejects a non-designer actor', async () => {
    ;(requireClientViewer as ReturnType<typeof vi.fn>).mockResolvedValue({ ...designerCtx, role: 'account_manager' })
    await expect(acknowledgeDesignerGateAction('batch_1')).rejects.toThrow(/designer/i)
    expect(upsertDesignerGateAck).not.toHaveBeenCalled()
  })

  it('rejects when the batch is not visible to the actor', async () => {
    ;(findClientForUser as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    await expect(acknowledgeDesignerGateAction('batch_1')).rejects.toThrow(/not found/i)
    expect(upsertDesignerGateAck).not.toHaveBeenCalled()
  })
})
