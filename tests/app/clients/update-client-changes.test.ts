import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/middleware/permissions', () => ({ requireClientEditor: vi.fn() }))
vi.mock('@/server/repositories/clients', () => ({
  createClient: vi.fn(),
  updateClient: vi.fn(),
  deactivateClient: vi.fn(),
  findClientForUser: vi.fn(),
}))
vi.mock('@/server/services/activity', () => ({
  recordActivity: vi.fn(),
  ActivityKind: { client_profile_edited: 'client_profile_edited', client_created: 'client_created', client_archived: 'client_archived' },
}))
vi.mock('@/db/client', () => ({ db: { user: { findMany: vi.fn() } } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/schemas/client', () => ({
  clientInputSchema: { parse: (x: unknown) => x },
  clientUpdateSchema: { parse: (x: unknown) => x },
}))

import { updateClientAction } from '@/app/(app)/clients/actions'
import { requireClientEditor } from '@/server/middleware/permissions'
import { findClientForUser, updateClient } from '@/server/repositories/clients'
import { recordActivity } from '@/server/services/activity'
import { db } from '@/db/client'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireClientEditor).mockResolvedValue({ userDbId: 'actor', organizationDbId: 'org1' } as never)
  vi.mocked(updateClient).mockResolvedValue({} as never)
  vi.mocked(db.user.findMany).mockResolvedValue([] as never)
})

describe('updateClientAction change capture', () => {
  it('records client_profile_edited with from/to for a simple field', async () => {
    vi.mocked(findClientForUser).mockResolvedValue({ id: 'c1', mainCta: 'Call now', assignedAmId: null } as never)
    await updateClientAction('c1', { mainCta: 'Book today' } as never)
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'client_profile_edited',
        payload: { changes: [{ field: 'mainCta', from: 'Call now', to: 'Book today' }] },
      }),
    )
  })

  it('resolves assignedAmId to a user name in the diff', async () => {
    vi.mocked(findClientForUser).mockResolvedValue({ id: 'c1', assignedAmId: 'u1' } as never)
    vi.mocked(db.user.findMany).mockResolvedValue([{ id: 'u1', name: 'Mollie' }, { id: 'u2', name: 'Caleb' }] as never)
    await updateClientAction('c1', { assignedAmId: 'u2' } as never)
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { changes: [{ field: 'assignedAmId', from: 'Mollie', to: 'Caleb' }] },
      }),
    )
  })

  it('records nothing when no field changed', async () => {
    vi.mocked(findClientForUser).mockResolvedValue({ id: 'c1', mainCta: 'Same' } as never)
    await updateClientAction('c1', { mainCta: 'Same' } as never)
    expect(recordActivity).not.toHaveBeenCalled()
  })
})
