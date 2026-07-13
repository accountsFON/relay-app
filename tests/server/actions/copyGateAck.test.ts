// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { acknowledgeCopyGateAction } from '@/server/actions/copyGateAck'
import { requireClientViewer } from '@/server/middleware/permissions'
import { findBatch } from '@/server/repositories/batches'
import { findClientForUser } from '@/server/repositories/clients'
import { upsertCopyGateAck } from '@/server/repositories/copyGateAcks'
import { revalidatePath } from 'next/cache'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/server/middleware/permissions', () => ({ requireClientViewer: vi.fn() }))
vi.mock('@/server/repositories/batches', () => ({ findBatch: vi.fn() }))
vi.mock('@/server/repositories/clients', () => ({ findClientForUser: vi.fn() }))
vi.mock('@/server/repositories/copyGateAcks', () => ({ upsertCopyGateAck: vi.fn() }))

const amCtx = { role: 'account_manager', userDbId: 'user_1', organizationDbId: 'org_1' }

beforeEach(() => {
  vi.resetAllMocks()
  ;(requireClientViewer as ReturnType<typeof vi.fn>).mockResolvedValue(amCtx)
  ;(findBatch as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'batch_1', clientId: 'client_1' })
  ;(findClientForUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'client_1' })
})

describe('acknowledgeCopyGateAction', () => {
  it('upserts the ack and revalidates the batch page for an account manager', async () => {
    const result = await acknowledgeCopyGateAction('batch_1')
    expect(result).toEqual({ ok: true })
    expect(upsertCopyGateAck).toHaveBeenCalledWith({
      organizationId: 'org_1',
      batchId: 'batch_1',
      userId: 'user_1',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/clients/client_1/batches/batch_1')
  })

  it('allows an admin actor', async () => {
    ;(requireClientViewer as ReturnType<typeof vi.fn>).mockResolvedValue({ ...amCtx, role: 'admin' })
    const result = await acknowledgeCopyGateAction('batch_1')
    expect(result).toEqual({ ok: true })
    expect(upsertCopyGateAck).toHaveBeenCalledOnce()
  })

  it('rejects a designer actor', async () => {
    ;(requireClientViewer as ReturnType<typeof vi.fn>).mockResolvedValue({ ...amCtx, role: 'designer' })
    await expect(acknowledgeCopyGateAction('batch_1')).rejects.toThrow(/copy/i)
    expect(upsertCopyGateAck).not.toHaveBeenCalled()
  })

  it('rejects a client actor', async () => {
    ;(requireClientViewer as ReturnType<typeof vi.fn>).mockResolvedValue({ ...amCtx, role: 'client' })
    await expect(acknowledgeCopyGateAction('batch_1')).rejects.toThrow(/copy/i)
    expect(upsertCopyGateAck).not.toHaveBeenCalled()
  })

  it('rejects when the batch is not visible to the actor (cross-org)', async () => {
    ;(findClientForUser as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    await expect(acknowledgeCopyGateAction('batch_1')).rejects.toThrow(/not found/i)
    expect(upsertCopyGateAck).not.toHaveBeenCalled()
  })

  it('rejects when the batch does not exist', async () => {
    ;(findBatch as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    await expect(acknowledgeCopyGateAction('batch_1')).rejects.toThrow(/not found/i)
    expect(upsertCopyGateAck).not.toHaveBeenCalled()
  })
})
