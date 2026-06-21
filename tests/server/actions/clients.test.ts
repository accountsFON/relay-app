// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/middleware/permissions', () => ({ requireClientEditor: vi.fn() }))
vi.mock('@/server/repositories/clients', () => ({
  findClientForUser: vi.fn(),
  updateClient: vi.fn(),
}))
vi.mock('@/server/services/activity', async () => {
  const actual = await vi.importActual<typeof import('@prisma/client')>('@prisma/client')
  return { recordActivity: vi.fn(), ActivityKind: actual.ActivityKind }
})
vi.mock('@/db/client', () => ({ db: { user: { findMany: vi.fn() } } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { requireClientEditor } from '@/server/middleware/permissions'
import { findClientForUser, updateClient } from '@/server/repositories/clients'
import { recordActivity } from '@/server/services/activity'
import { db } from '@/db/client'
import { ActivityKind } from '@prisma/client'
import { updateClientAction } from '@/app/(app)/clients/actions'

const ctx = { organizationDbId: 'cuid_org_1', userDbId: 'cuid_am_1' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireClientEditor).mockResolvedValue(ctx as never)
  vi.mocked(db.user.findMany).mockResolvedValue([] as never)
})

describe('updateClientAction — clientReviewEmail', () => {
  it('persists clientReviewEmail and records the change with its label', async () => {
    vi.mocked(findClientForUser).mockResolvedValue({
      id: 'cuid_client_1', clientReviewEmail: null,
    } as never)

    await updateClientAction('cuid_client_1', { clientReviewEmail: 'jane@client.com' })

    expect(updateClient).toHaveBeenCalledWith('cuid_client_1', 'cuid_org_1', {
      clientReviewEmail: 'jane@client.com',
    })
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: ActivityKind.client_profile_edited,
        payload: { changes: [{ field: 'clientReviewEmail', from: '(empty)', to: 'jane@client.com' }] },
      }),
    )
  })
})
