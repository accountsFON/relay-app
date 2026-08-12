import { describe, it, expect, vi } from 'vitest'
import {
  decodeServiceAccountKey,
  DriveConfigError,
  parseDriveFolderId,
  findOrCreateFolder,
  upsertImage,
  type DriveClient,
} from '@/lib/google-drive'

// ---- decodeServiceAccountKey ----

describe('decodeServiceAccountKey', () => {
  const good = { client_email: 'sa@x.iam.gserviceaccount.com', private_key: '-----KEY-----' }

  it('accepts raw JSON', () => {
    expect(decodeServiceAccountKey(JSON.stringify(good))).toEqual(good)
  })

  it('accepts base64-encoded JSON', () => {
    const b64 = Buffer.from(JSON.stringify(good)).toString('base64')
    expect(decodeServiceAccountKey(b64)).toEqual(good)
  })

  it('throws when unset', () => {
    expect(() => decodeServiceAccountKey(undefined)).toThrow(DriveConfigError)
    expect(() => decodeServiceAccountKey('')).toThrow(DriveConfigError)
  })

  it('throws on non-JSON / non-base64 garbage', () => {
    expect(() => decodeServiceAccountKey('not json at all !!!')).toThrow(DriveConfigError)
  })

  it('throws when required fields are missing', () => {
    expect(() => decodeServiceAccountKey(JSON.stringify({ client_email: 'a@b' }))).toThrow(
      DriveConfigError,
    )
  })
})

// ---- parseDriveFolderId ----

describe('parseDriveFolderId', () => {
  it('parses a /folders/{id} share URL', () => {
    expect(
      parseDriveFolderId('https://drive.google.com/drive/folders/1AbC_dEfG-hIjK?usp=sharing'),
    ).toBe('1AbC_dEfG-hIjK')
  })

  it('parses an open?id={id} URL', () => {
    expect(parseDriveFolderId('https://drive.google.com/open?id=1AbC_dEfG-hIjK')).toBe(
      '1AbC_dEfG-hIjK',
    )
  })

  it('accepts a bare id', () => {
    expect(parseDriveFolderId('1AbC_dEfG-hIjK')).toBe('1AbC_dEfG-hIjK')
  })

  it('returns null for empty / non-drive input', () => {
    expect(parseDriveFolderId(null)).toBeNull()
    expect(parseDriveFolderId(undefined)).toBeNull()
    expect(parseDriveFolderId('')).toBeNull()
    expect(parseDriveFolderId('https://example.com/foo')).toBeNull()
  })
})

// ---- findOrCreateFolder ----

function mockDrive(overrides: Record<string, unknown> = {}): DriveClient {
  return {
    files: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      ...overrides,
    },
  } as unknown as DriveClient
}

describe('findOrCreateFolder', () => {
  it('returns the existing folder without creating when found', async () => {
    const drive = mockDrive()
    vi.mocked(drive.files.list).mockResolvedValue({
      data: { files: [{ id: 'folder_1', name: 'September 2026' }] },
    } as never)

    const res = await findOrCreateFolder(drive, { parentId: 'parent_1', name: 'September 2026' })

    expect(res).toEqual({
      id: 'folder_1',
      url: 'https://drive.google.com/drive/folders/folder_1',
      created: false,
    })
    expect(drive.files.create).not.toHaveBeenCalled()
    // Shared-Drive flags present on the lookup.
    const listArg = vi.mocked(drive.files.list).mock.calls[0][0]
    expect(listArg).toMatchObject({ supportsAllDrives: true, includeItemsFromAllDrives: true })
  })

  it('creates the folder when none is found', async () => {
    const drive = mockDrive()
    vi.mocked(drive.files.list).mockResolvedValue({ data: { files: [] } } as never)
    vi.mocked(drive.files.create).mockResolvedValue({ data: { id: 'new_folder' } } as never)

    const res = await findOrCreateFolder(drive, { parentId: 'parent_1', name: 'October 2026' })

    expect(res).toEqual({
      id: 'new_folder',
      url: 'https://drive.google.com/drive/folders/new_folder',
      created: true,
    })
    const createArg = vi.mocked(drive.files.create).mock.calls[0][0]
    expect(createArg).toMatchObject({
      requestBody: {
        name: 'October 2026',
        mimeType: 'application/vnd.google-apps.folder',
        parents: ['parent_1'],
      },
      supportsAllDrives: true,
    })
  })
})

// ---- upsertImage ----

describe('upsertImage', () => {
  const bytes = Buffer.from('fake-image-bytes')

  it('overwrites the existing file when one of the same name exists', async () => {
    const drive = mockDrive()
    vi.mocked(drive.files.list).mockResolvedValue({ data: { files: [{ id: 'file_1' }] } } as never)
    vi.mocked(drive.files.update).mockResolvedValue({ data: { id: 'file_1' } } as never)

    const res = await upsertImage(drive, {
      folderId: 'folder_1',
      name: '01.jpg',
      contentType: 'image/jpeg',
      bytes,
    })

    expect(res).toEqual({ id: 'file_1', overwritten: true })
    expect(drive.files.create).not.toHaveBeenCalled()
    expect(vi.mocked(drive.files.update).mock.calls[0][0]).toMatchObject({
      fileId: 'file_1',
      supportsAllDrives: true,
    })
  })

  it('creates a new file when none exists', async () => {
    const drive = mockDrive()
    vi.mocked(drive.files.list).mockResolvedValue({ data: { files: [] } } as never)
    vi.mocked(drive.files.create).mockResolvedValue({ data: { id: 'file_2' } } as never)

    const res = await upsertImage(drive, {
      folderId: 'folder_1',
      name: '02.png',
      contentType: 'image/png',
      bytes,
    })

    expect(res).toEqual({ id: 'file_2', overwritten: false })
    expect(drive.files.update).not.toHaveBeenCalled()
    expect(vi.mocked(drive.files.create).mock.calls[0][0]).toMatchObject({
      requestBody: { name: '02.png', parents: ['folder_1'] },
      supportsAllDrives: true,
    })
  })
})
