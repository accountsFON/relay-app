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
