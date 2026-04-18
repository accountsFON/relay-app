import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/middleware/permissions', () => ({
  requireClientEditor: vi.fn(),
}))

vi.mock('@/server/repositories/clients', () => ({
  createClient: vi.fn(),
  updateClient: vi.fn(),
  archiveClient: vi.fn(),
  findClientById: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { requireClientEditor } from '@/server/middleware/permissions'
import {
  createClient,
  updateClient,
  archiveClient,
} from '@/server/repositories/clients'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import {
  createClientAction,
  updateClientAction,
  archiveClientAction,
} from '@/app/(app)/clients/actions'

const mockCtx = {
  userId: 'user_clerk_123',
  orgId: 'fon-internal',
  role: 'admin' as const,
  plan: 'agency' as const,
  organizationDbId: 'cuid_org_1',
  userDbId: 'cuid_user_1',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireClientEditor).mockResolvedValue(mockCtx)
})

describe('createClientAction', () => {
  it('creates a client then redirects to its detail page', async () => {
    vi.mocked(createClient).mockResolvedValue({ id: 'cuid_client_1' } as any)

    await createClientAction({
      name: 'Akkoo Coffee',
      postingDays: 'Mon,Wed,Fri',
      holidayHandling: 'Major-US',
      urls: [],
      excludedDates: [],
      autoCrawl: 'always',
      status: 'active',
    })

    expect(requireClientEditor).toHaveBeenCalled()
    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'cuid_org_1',
        name: 'Akkoo Coffee',
      })
    )
    expect(revalidatePath).toHaveBeenCalledWith('/clients')
    expect(redirect).toHaveBeenCalledWith('/clients/cuid_client_1')
  })

  it('rejects invalid input without calling the repository', async () => {
    await expect(
      createClientAction({
        name: '', // invalid
        postingDays: 'Mon,Wed,Fri',
        holidayHandling: 'Major-US',
        urls: [],
        excludedDates: [],
        autoCrawl: 'always',
        status: 'active',
      })
    ).rejects.toThrow()

    expect(createClient).not.toHaveBeenCalled()
  })
})

describe('updateClientAction', () => {
  it('updates a client and revalidates the detail page', async () => {
    vi.mocked(updateClient).mockResolvedValue({ count: 1 } as any)

    await updateClientAction('cuid_client_1', {
      name: 'Akkoo Coffee Renamed',
    })

    expect(updateClient).toHaveBeenCalledWith('cuid_client_1', 'cuid_org_1', {
      name: 'Akkoo Coffee Renamed',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/clients/cuid_client_1')
    expect(revalidatePath).toHaveBeenCalledWith('/clients')
  })
})

describe('archiveClientAction', () => {
  it('archives a client and revalidates the list', async () => {
    vi.mocked(archiveClient).mockResolvedValue({ count: 1 } as any)

    await archiveClientAction('cuid_client_1')

    expect(archiveClient).toHaveBeenCalledWith('cuid_client_1', 'cuid_org_1')
    expect(revalidatePath).toHaveBeenCalledWith('/clients')
  })
})
