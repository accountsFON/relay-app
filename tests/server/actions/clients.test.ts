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
vi.mock('@/server/services/assets-folder-check', () => ({ checkAssetsFolder: vi.fn() }))

import { requireClientEditor } from '@/server/middleware/permissions'
import { findClientForUser, updateClient } from '@/server/repositories/clients'
import { recordActivity } from '@/server/services/activity'
import { db } from '@/db/client'
import { ActivityKind } from '@prisma/client'
import { updateClientAction } from '@/app/(app)/clients/actions'
import { checkAssetsFolder } from '@/server/services/assets-folder-check'

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

/**
 * Assets folder validation on save. Added 2026-08-31 after Elevated Tree
 * Solutions: the field had no validation of any kind, so a read-only folder in
 * the client's personal Drive sat there until a relay finished and the Drive
 * upload was refused. The check runs at save time and REPORTS; it never blocks
 * the write, because a Drive outage must not stop someone editing a client.
 */
describe('updateClientAction — assets folder validation', () => {
  it('checks the folder when the assets URL changes and returns the verdict', async () => {
    vi.mocked(findClientForUser).mockResolvedValue({
      id: 'cuid_client_1',
      assetsFolderUrl: 'https://drive.google.com/drive/folders/old',
    } as never)
    vi.mocked(checkAssetsFolder).mockResolvedValue({
      status: 'read-only',
      name: 'Ad Photos',
      ownerEmail: 'client@gmail.com',
    })

    const res = await updateClientAction('cuid_client_1', {
      assetsFolderUrl: 'https://drive.google.com/drive/folders/new',
    })

    expect(checkAssetsFolder).toHaveBeenCalledWith('https://drive.google.com/drive/folders/new')
    expect(res?.assetsFolder).toEqual({
      status: 'read-only',
      name: 'Ad Photos',
      ownerEmail: 'client@gmail.com',
    })
  })

  it('still saves the client when the folder is bad', async () => {
    vi.mocked(findClientForUser).mockResolvedValue({
      id: 'cuid_client_1',
      assetsFolderUrl: null,
    } as never)
    vi.mocked(checkAssetsFolder).mockResolvedValue({ status: 'not-found' })

    await updateClientAction('cuid_client_1', {
      assetsFolderUrl: 'https://drive.google.com/drive/folders/gone',
    })

    expect(updateClient).toHaveBeenCalledWith('cuid_client_1', 'cuid_org_1', {
      assetsFolderUrl: 'https://drive.google.com/drive/folders/gone',
    })
  })

  it('does not touch Drive when the assets URL is unchanged', async () => {
    const same = 'https://drive.google.com/drive/folders/same'
    vi.mocked(findClientForUser).mockResolvedValue({
      id: 'cuid_client_1',
      assetsFolderUrl: same,
    } as never)

    await updateClientAction('cuid_client_1', { assetsFolderUrl: same })

    expect(checkAssetsFolder).not.toHaveBeenCalled()
  })

  it('does not touch Drive when the edit is to some other field', async () => {
    vi.mocked(findClientForUser).mockResolvedValue({
      id: 'cuid_client_1',
      clientReviewEmail: null,
    } as never)

    await updateClientAction('cuid_client_1', { clientReviewEmail: 'jane@client.com' })

    expect(checkAssetsFolder).not.toHaveBeenCalled()
  })

  it('never lets a check fault break the save', async () => {
    vi.mocked(findClientForUser).mockResolvedValue({
      id: 'cuid_client_1',
      assetsFolderUrl: null,
    } as never)
    vi.mocked(checkAssetsFolder).mockRejectedValue(new Error('drive exploded'))

    const res = await updateClientAction('cuid_client_1', {
      assetsFolderUrl: 'https://drive.google.com/drive/folders/x',
    })

    expect(updateClient).toHaveBeenCalled()
    expect(res?.assetsFolder).toBeUndefined()
  })
})
