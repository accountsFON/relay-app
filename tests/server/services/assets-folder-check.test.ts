import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/google-drive', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/google-drive')>()
  return { ...actual, getDriveClient: vi.fn(), inspectFolder: vi.fn() }
})

import { checkAssetsFolder } from '@/server/services/assets-folder-check'
import { getDriveClient, inspectFolder, DriveConfigError } from '@/lib/google-drive'

/**
 * Save-time validation of Client.assetsFolderUrl.
 *
 * Origin: 2026-08-31. Elevated Tree Solutions had the client's own read-only
 * "Ad Photos" folder pasted into this field. The field had no validation of any
 * kind, so the mistake sat undetected until the first relay finished and the
 * Drive upload was refused. An audit that day found a second client (Dixie Lily
 * Foods) with the identical mistake, not yet triggered.
 */
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getDriveClient).mockResolvedValue({} as never)
})

function driveError(code: number, message: string) {
  return Object.assign(new Error(message), { code })
}

describe('checkAssetsFolder', () => {
  it('accepts a writable folder in the agency Shared Drive', async () => {
    vi.mocked(inspectFolder).mockResolvedValue({
      id: 'f1',
      name: 'Royal Oak Tree Service',
      isFolder: true,
      canAddChildren: true,
      sharedDriveId: '0APv',
      ownerEmail: null,
    })
    await expect(
      checkAssetsFolder('https://drive.google.com/drive/folders/f1'),
    ).resolves.toEqual({ status: 'ok', name: 'Royal Oak Tree Service', inSharedDrive: true })
  })

  it('rejects a folder Relay can read but cannot write into', async () => {
    // The Elevated Tree Solutions shape, verbatim.
    vi.mocked(inspectFolder).mockResolvedValue({
      id: 'f2',
      name: 'Ad Photos',
      isFolder: true,
      canAddChildren: false,
      sharedDriveId: null,
      ownerEmail: 'elevatedtreesolutions23@gmail.com',
    })
    await expect(
      checkAssetsFolder('https://drive.google.com/drive/folders/f2?usp=share_link'),
    ).resolves.toEqual({
      status: 'read-only',
      name: 'Ad Photos',
      ownerEmail: 'elevatedtreesolutions23@gmail.com',
    })
  })

  it('rejects a link that points at a file rather than a folder', async () => {
    vi.mocked(inspectFolder).mockResolvedValue({
      id: 'f3',
      name: 'Brand deck.pdf',
      isFolder: false,
      canAddChildren: false,
      sharedDriveId: null,
      ownerEmail: null,
    })
    const res = await checkAssetsFolder('https://drive.google.com/drive/folders/f3')
    expect(res).toEqual({ status: 'not-a-folder', name: 'Brand deck.pdf' })
  })

  it('reports a 404 as not found', async () => {
    vi.mocked(inspectFolder).mockRejectedValue(driveError(404, 'File not found: f4.'))
    await expect(
      checkAssetsFolder('https://drive.google.com/drive/folders/f4'),
    ).resolves.toEqual({ status: 'not-found' })
  })

  it('reports a 403 as no access', async () => {
    vi.mocked(inspectFolder).mockRejectedValue(
      driveError(403, 'The user does not have sufficient permissions for this file.'),
    )
    const res = await checkAssetsFolder('https://drive.google.com/drive/folders/f5')
    expect(res).toEqual({ status: 'no-access' })
  })

  it('treats a blank value as nothing to check', async () => {
    await expect(checkAssetsFolder('')).resolves.toEqual({ status: 'empty' })
    await expect(checkAssetsFolder(null)).resolves.toEqual({ status: 'empty' })
    expect(inspectFolder).not.toHaveBeenCalled()
  })

  it('reports a link that is not a Drive folder link at all', async () => {
    const res = await checkAssetsFolder('https://www.dropbox.com/scl/fo/abc')
    expect(res).toEqual({ status: 'unparseable' })
    expect(inspectFolder).not.toHaveBeenCalled()
  })

  it('stays quiet when Drive is not configured, so saving still works', async () => {
    vi.mocked(getDriveClient).mockRejectedValue(new DriveConfigError('GOOGLE_DRIVE_SA_KEY is not set'))
    await expect(
      checkAssetsFolder('https://drive.google.com/drive/folders/f6'),
    ).resolves.toEqual({ status: 'not-configured' })
  })

  it('never throws, so a Drive outage cannot block saving a client', async () => {
    vi.mocked(inspectFolder).mockRejectedValue(new Error('socket hang up'))
    const res = await checkAssetsFolder('https://drive.google.com/drive/folders/f7')
    expect(res.status).toBe('error')
  })
})
