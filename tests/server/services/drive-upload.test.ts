import { describe, it, expect, vi, beforeEach } from 'vitest'

// Keep parseDriveFolderId + DriveConfigError real; mock the client-facing fns.
vi.mock('@/lib/google-drive', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/google-drive')>()
  return {
    ...actual,
    getDriveClient: vi.fn(),
    findOrCreateFolder: vi.fn(),
    upsertImage: vi.fn(),
  }
})

vi.mock('@/db/client', () => ({
  db: {
    batch: { findUnique: vi.fn() },
    post: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}))

import { uploadPostGraphicsToDrive } from '@/server/services/drive-upload'
import {
  getDriveClient,
  findOrCreateFolder,
  upsertImage,
  DriveConfigError,
} from '@/lib/google-drive'
import { db } from '@/db/client'

const NOW = new Date('2026-09-15T12:00:00Z')

function stubImageFetch(contentType = 'image/jpeg') {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => contentType },
    arrayBuffer: async () => new ArrayBuffer(8),
  }) as unknown as typeof fetch
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getDriveClient).mockResolvedValue({} as never)
  vi.mocked(findOrCreateFolder).mockResolvedValue({
    id: 'folder_1',
    url: 'https://drive.google.com/drive/folders/folder_1',
    created: true,
  })
  vi.mocked(upsertImage).mockResolvedValue({ id: 'file_x', overwritten: false })
  vi.mocked(db.post.findFirst).mockResolvedValue({
    contentRun: { targetMonth: '2026-09' },
  } as never)
})

function mockBatch(assetsFolderUrl: string | null) {
  vi.mocked(db.batch.findUnique).mockResolvedValue({
    id: 'batch_1',
    label: 'Puppy Avenue September 2026',
    createdAt: NOW,
    client: { assetsFolderUrl },
  } as never)
}

describe('uploadPostGraphicsToDrive', () => {
  it('skips when the client has no Drive folder', async () => {
    mockBatch(null)
    vi.mocked(db.post.findMany).mockResolvedValue([] as never)
    const res = await uploadPostGraphicsToDrive('batch_1', NOW)
    expect(res).toEqual({ status: 'skipped', reason: 'no-folder' })
    expect(findOrCreateFolder).not.toHaveBeenCalled()
  })

  it('skips when there are no images', async () => {
    mockBatch('https://drive.google.com/drive/folders/parent_1')
    vi.mocked(db.post.findMany).mockResolvedValue([
      { id: 'p1', postDate: NOW, mediaUrls: [] },
    ] as never)
    const res = await uploadPostGraphicsToDrive('batch_1', NOW)
    expect(res).toEqual({ status: 'skipped', reason: 'no-images' })
  })

  it('skips when Drive is not configured', async () => {
    mockBatch('https://drive.google.com/drive/folders/parent_1')
    vi.mocked(db.post.findMany).mockResolvedValue([
      { id: 'p1', postDate: NOW, mediaUrls: ['https://blob/x.jpg'] },
    ] as never)
    vi.mocked(getDriveClient).mockRejectedValue(new DriveConfigError('unset'))
    const res = await uploadPostGraphicsToDrive('batch_1', NOW)
    expect(res).toEqual({ status: 'skipped', reason: 'not-configured' })
  })

  it('uploads each post graphic into the month folder, numbered in order', async () => {
    mockBatch('https://drive.google.com/drive/folders/parent_1')
    vi.mocked(db.post.findMany).mockResolvedValue([
      { id: 'p1', postDate: new Date('2026-09-01'), mediaUrls: ['https://blob/a'] },
      { id: 'p2', postDate: new Date('2026-09-02'), mediaUrls: ['https://blob/b'] },
    ] as never)
    stubImageFetch('image/png')

    const res = await uploadPostGraphicsToDrive('batch_1', NOW)

    expect(res.status).toBe('ok')
    if (res.status !== 'ok') throw new Error('expected ok')
    expect(res.month).toBe('September 2026')
    expect(res.uploaded).toBe(2)
    expect(res.failed).toEqual([])
    // Folder is the resolved month under the parsed parent.
    expect(findOrCreateFolder).toHaveBeenCalledWith(expect.anything(), {
      parentId: 'parent_1',
      name: 'September 2026',
    })
    const names = vi.mocked(upsertImage).mock.calls.map((c) => c[1].name)
    expect(names).toEqual(['01.png', '02.png'])
  })

  it('uploads a rerun batch into a suffixed month folder (no clobber of the first)', async () => {
    vi.mocked(db.batch.findUnique).mockResolvedValue({
      id: 'batch_1',
      label: 'Puppy Avenue September 2026 (2)',
      createdAt: NOW,
      client: { assetsFolderUrl: 'https://drive.google.com/drive/folders/parent_1' },
    } as never)
    vi.mocked(db.post.findMany).mockResolvedValue([
      { id: 'p1', postDate: new Date('2026-09-01'), mediaUrls: ['https://blob/a'] },
    ] as never)
    stubImageFetch('image/png')

    const res = await uploadPostGraphicsToDrive('batch_1', NOW)

    if (res.status === 'skipped') throw new Error('unexpected skip')
    expect(res.month).toBe('September 2026 (2)')
    expect(findOrCreateFolder).toHaveBeenCalledWith(expect.anything(), {
      parentId: 'parent_1',
      name: 'September 2026 (2)',
    })
  })

  it('names multi-image posts with a per-image suffix', async () => {
    mockBatch('https://drive.google.com/drive/folders/parent_1')
    vi.mocked(db.post.findMany).mockResolvedValue([
      { id: 'p1', postDate: new Date('2026-09-01'), mediaUrls: ['https://blob/a', 'https://blob/b'] },
    ] as never)
    stubImageFetch('image/jpeg')

    const res = await uploadPostGraphicsToDrive('batch_1', NOW)

    const names = vi.mocked(upsertImage).mock.calls.map((c) => c[1].name)
    expect(names).toEqual(['01-1.jpg', '01-2.jpg'])
    expect(res.status).toBe('ok')
  })

  it('reports partial when one image fails but others succeed', async () => {
    mockBatch('https://drive.google.com/drive/folders/parent_1')
    vi.mocked(db.post.findMany).mockResolvedValue([
      { id: 'p1', postDate: new Date('2026-09-01'), mediaUrls: ['https://blob/a'] },
      { id: 'p2', postDate: new Date('2026-09-02'), mediaUrls: ['https://blob/b'] },
    ] as never)
    stubImageFetch('image/jpeg')
    vi.mocked(upsertImage)
      .mockResolvedValueOnce({ id: 'f1', overwritten: false })
      .mockRejectedValueOnce(new Error('drive 500'))

    const res = await uploadPostGraphicsToDrive('batch_1', NOW)

    expect(res.status).toBe('partial')
    if (res.status === 'skipped') throw new Error('unexpected skip')
    expect(res.uploaded).toBe(1)
    expect(res.failed).toHaveLength(1)
    expect(res.failed[0].reason).toContain('drive 500')
  })

  it('counts overwrites separately from fresh uploads', async () => {
    mockBatch('https://drive.google.com/drive/folders/parent_1')
    vi.mocked(db.post.findMany).mockResolvedValue([
      { id: 'p1', postDate: new Date('2026-09-01'), mediaUrls: ['https://blob/a'] },
    ] as never)
    stubImageFetch('image/jpeg')
    vi.mocked(upsertImage).mockResolvedValue({ id: 'f1', overwritten: true })

    const res = await uploadPostGraphicsToDrive('batch_1', NOW)
    if (res.status === 'skipped') throw new Error('unexpected skip')
    expect(res.overwritten).toBe(1)
    expect(res.uploaded).toBe(0)
  })

  it('returns failed when the folder cannot be created', async () => {
    mockBatch('https://drive.google.com/drive/folders/parent_1')
    vi.mocked(db.post.findMany).mockResolvedValue([
      { id: 'p1', postDate: new Date('2026-09-01'), mediaUrls: ['https://blob/a'] },
    ] as never)
    stubImageFetch('image/jpeg')
    vi.mocked(findOrCreateFolder).mockRejectedValue(new Error('no access to shared drive'))

    const res = await uploadPostGraphicsToDrive('batch_1', NOW)
    expect(res.status).toBe('failed')
    if (res.status === 'skipped') throw new Error('unexpected skip')
    expect(res.uploaded).toBe(0)
    expect(res.failed[0].reason).toContain('no access')
    expect(upsertImage).not.toHaveBeenCalled()
  })
})

/**
 * Diagnostics, added 2026-08-31 after the Elevated Tree Solutions incident.
 * The service already collected Google's real reason into failed[].reason and
 * then only ever returned it to the browser, where a generic toast dropped it.
 * Nothing reached the server logs unless the call threw outright, so a failed
 * upload left no trace at all and had to be reproduced by hand against the
 * live Drive API to diagnose. These lock in that a failure is logged.
 */
describe('uploadPostGraphicsToDrive diagnostics', () => {
  it('logs the batch and Google reason when the folder cannot be created', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockBatch('https://drive.google.com/drive/folders/parent_1')
    vi.mocked(db.post.findMany).mockResolvedValue([
      { id: 'p1', postDate: NOW, mediaUrls: ['https://blob/a.jpg'] },
    ] as never)
    vi.mocked(findOrCreateFolder).mockRejectedValue(
      new Error('The user does not have sufficient permissions for this file.'),
    )

    await uploadPostGraphicsToDrive('batch_1', NOW)

    expect(spy).toHaveBeenCalledTimes(1)
    const logged = JSON.stringify(spy.mock.calls[0])
    expect(logged).toContain('batch_1')
    expect(logged).toContain('sufficient permissions')
    spy.mockRestore()
  })

  it('logs the per-image reasons when only some images fail', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockBatch('https://drive.google.com/drive/folders/parent_1')
    vi.mocked(db.post.findMany).mockResolvedValue([
      { id: 'p1', postDate: NOW, mediaUrls: ['https://blob/a.jpg'] },
      { id: 'p2', postDate: NOW, mediaUrls: ['https://blob/b.jpg'] },
    ] as never)
    stubImageFetch()
    vi.mocked(upsertImage)
      .mockResolvedValueOnce({ id: 'file_a', overwritten: false })
      .mockRejectedValueOnce(new Error('quota exceeded'))

    const res = await uploadPostGraphicsToDrive('batch_1', NOW)

    expect(res.status).toBe('partial')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(spy.mock.calls[0])).toContain('quota exceeded')
    spy.mockRestore()
  })

  it('stays quiet when every graphic uploads cleanly', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockBatch('https://drive.google.com/drive/folders/parent_1')
    vi.mocked(db.post.findMany).mockResolvedValue([
      { id: 'p1', postDate: NOW, mediaUrls: ['https://blob/a.jpg'] },
    ] as never)
    stubImageFetch()

    const res = await uploadPostGraphicsToDrive('batch_1', NOW)

    expect(res.status).toBe('ok')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
