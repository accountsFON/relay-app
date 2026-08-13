import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/middleware/permissions', () => ({
  requireClientEditor: vi.fn(),
  requireCan: vi.fn(),
}))
vi.mock('@/server/repositories/clients', () => ({
  createClient: vi.fn(),
  updateClient: vi.fn(),
  deactivateClient: vi.fn(),
  findClientForUser: vi.fn(),
}))
vi.mock('@/server/services/activity', () => ({
  recordActivity: vi.fn(),
  ActivityKind: {},
}))
vi.mock('@/db/client', () => ({ db: { user: { findMany: vi.fn() } } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/schemas/client', () => ({
  clientInputSchema: { parse: (x: unknown) => x },
  clientUpdateSchema: { parse: (x: unknown) => x },
}))
// Partial-mock the wrapper: keep the real error classes + pickServiceUserId so
// instanceof checks in the action work, but stub the two network functions.
vi.mock('@/lib/nectr-social', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/nectr-social')>()
  return { ...actual, getAccounts: vi.fn(), getUsers: vi.fn() }
})

import { checkNectrConnectionAction } from '@/app/(app)/clients/actions'
import { requireClientEditor } from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import { getAccounts, getUsers, NectrConfigError, NectrApiError } from '@/lib/nectr-social'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireClientEditor).mockResolvedValue({ userDbId: 'actor', organizationDbId: 'org1' } as never)
})

describe('checkNectrConnectionAction', () => {
  it('returns no-location and never calls NECTR when the client is out of scope', async () => {
    vi.mocked(findClientForUser).mockResolvedValue(null as never)
    const res = await checkNectrConnectionAction('c1')
    expect(res).toEqual({ status: 'no-location' })
    expect(getAccounts).not.toHaveBeenCalled()
  })

  it('returns no-location when the client has no nectrLocationId', async () => {
    vi.mocked(findClientForUser).mockResolvedValue({ id: 'c1', nectrLocationId: null } as never)
    const res = await checkNectrConnectionAction('c1')
    expect(res).toEqual({ status: 'no-location' })
    expect(getAccounts).not.toHaveBeenCalled()
  })

  it('returns ok with accounts and a resolved service user', async () => {
    vi.mocked(findClientForUser).mockResolvedValue({ id: 'c1', nectrLocationId: 'loc1' } as never)
    vi.mocked(getAccounts).mockResolvedValue([
      { id: 'a1', platform: 'facebook', name: 'FB', type: 'page', isExpired: false },
    ])
    vi.mocked(getUsers).mockResolvedValue([
      { id: 'u1', name: 'Julio', email: null, role: 'admin' },
    ])
    const res = await checkNectrConnectionAction('c1')
    expect(res).toEqual({
      status: 'ok',
      accounts: [{ id: 'a1', platform: 'facebook', name: 'FB', type: 'page', isExpired: false }],
      serviceUserId: 'u1',
    })
  })

  it('returns not-configured when the agency token is unset', async () => {
    vi.mocked(findClientForUser).mockResolvedValue({ id: 'c1', nectrLocationId: 'loc1' } as never)
    vi.mocked(getAccounts).mockRejectedValue(new NectrConfigError('NECTR_AGENCY_TOKEN is not set'))
    const res = await checkNectrConnectionAction('c1')
    expect(res).toEqual({ status: 'not-configured' })
  })

  it('returns error with the message on an API failure', async () => {
    vi.mocked(findClientForUser).mockResolvedValue({ id: 'c1', nectrLocationId: 'loc1' } as never)
    vi.mocked(getAccounts).mockRejectedValue(new NectrApiError(403, 'NECTR API 403: Forbidden'))
    const res = await checkNectrConnectionAction('c1')
    expect(res).toEqual({ status: 'error', message: 'NECTR API 403: Forbidden' })
  })
})
