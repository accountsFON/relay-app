import { describe, it, expect } from 'vitest'
import {
  driveUploadMessage,
  classifyDriveFailure,
  assetsFolderCheckMessage,
  ASSETS_FOLDER_FIELD_LABEL,
} from '@/lib/drive-upload-message'
import type { DriveUploadResult } from '@/server/services/drive-upload'

/**
 * Regression cover for the 2026-08-31 Elevated Tree Solutions incident: the
 * client's assetsFolderUrl pointed at a read-only folder in the client's own
 * personal Drive, Google refused the folder create, and the AM was shown
 * "Drive graphics upload failed." with no way to know what to fix.
 */
describe('classifyDriveFailure', () => {
  it('reads a Google permission refusal as a permission problem', () => {
    expect(
      classifyDriveFailure('The user does not have sufficient permissions for this file.'),
    ).toBe('permission')
  })

  it('reads a Google 404 as a missing folder', () => {
    expect(classifyDriveFailure('File not found: 1nas_B9G5rsgqAq.')).toBe('not-found')
  })

  it('falls back to unknown for anything it does not recognise', () => {
    expect(classifyDriveFailure('socket hang up')).toBe('unknown')
  })
})

describe('driveUploadMessage', () => {
  const failed = (reason: string): DriveUploadResult => ({
    status: 'failed',
    folderUrl: null,
    month: 'August 2026',
    uploaded: 0,
    overwritten: 0,
    failed: [{ name: '(folder August 2026)', reason }],
  })

  it('tells the AM the folder is read only and names the field to fix', () => {
    // The whole point of the incident: the old copy said only "failed".
    const msg = driveUploadMessage(
      failed('The user does not have sufficient permissions for this file.'),
    )
    expect(msg?.tone).toBe('error')
    expect(msg?.text).toContain(ASSETS_FOLDER_FIELD_LABEL)
    expect(msg?.text).toMatch(/read only/i)
    expect(msg?.retryable).toBe(true)
  })

  it('tells the AM the folder is missing when Google returns not found', () => {
    const msg = driveUploadMessage(failed('File not found: abc123.'))
    expect(msg?.text).toContain(ASSETS_FOLDER_FIELD_LABEL)
    expect(msg?.text).toMatch(/could not be found|no longer exists/i)
  })

  it('still surfaces the raw reason when the cause is unrecognised', () => {
    const msg = driveUploadMessage(failed('socket hang up'))
    expect(msg?.text).toContain('socket hang up')
  })

  it('confirms a successful upload with the count and the month', () => {
    const msg = driveUploadMessage({
      status: 'ok',
      folderUrl: 'https://drive.google.com/drive/folders/x',
      month: 'August 2026',
      uploaded: 11,
      overwritten: 1,
      failed: [],
    })
    expect(msg?.tone).toBe('success')
    expect(msg?.text).toContain('12')
    expect(msg?.text).toContain('August 2026')
    expect(msg?.retryable).toBe(false)
  })

  it('reports how many made it and how many did not on a partial upload', () => {
    const msg = driveUploadMessage({
      status: 'partial',
      folderUrl: 'https://drive.google.com/drive/folders/x',
      month: 'August 2026',
      uploaded: 9,
      overwritten: 0,
      failed: [
        { name: '10.jpg', reason: 'fetch failed (404)' },
        { name: '11.jpg', reason: 'fetch failed (404)' },
      ],
    })
    expect(msg?.tone).toBe('error')
    expect(msg?.text).toContain('9')
    expect(msg?.text).toContain('2')
    expect(msg?.retryable).toBe(true)
  })

  it('names the field to fill in when the client has no folder set', () => {
    const msg = driveUploadMessage({ status: 'skipped', reason: 'no-folder' })
    expect(msg?.tone).toBe('info')
    expect(msg?.text).toContain(ASSETS_FOLDER_FIELD_LABEL)
    expect(msg?.retryable).toBe(false)
  })

  it('says nothing at all when the batch simply had no graphics', () => {
    expect(driveUploadMessage({ status: 'skipped', reason: 'no-images' })).toBeNull()
  })

  it('reports an unexpected fault as retryable without blaming the folder', () => {
    const msg = driveUploadMessage(null)
    expect(msg?.tone).toBe('error')
    expect(msg?.retryable).toBe(true)
    expect(msg?.text).not.toContain(ASSETS_FOLDER_FIELD_LABEL)
  })
})

/**
 * Save-time copy for the assets folder check. The reader is an AM who has just
 * pasted a link, so every problem message has to say what to paste instead.
 */
describe('assetsFolderCheckMessage', () => {
  it('says nothing when the folder is writable', () => {
    expect(
      assetsFolderCheckMessage({ status: 'ok', name: 'Royal Oak', inSharedDrive: true }),
    ).toBeNull()
  })

  it('says nothing when the field was cleared or Drive is unconfigured', () => {
    expect(assetsFolderCheckMessage({ status: 'empty' })).toBeNull()
    expect(assetsFolderCheckMessage({ status: 'not-configured' })).toBeNull()
  })

  it('warns when a writable folder sits outside the agency Shared Drive', () => {
    // Writable, so the upload will work, and it is still probably a mistake.
    const msg = assetsFolderCheckMessage({
      status: 'ok',
      name: 'My Folder',
      inSharedDrive: false,
    })
    expect(msg?.tone).toBe('warning')
    expect(msg?.text).toMatch(/shared drive/i)
  })

  it('names the folder and its owner when the folder is read only', () => {
    const msg = assetsFolderCheckMessage({
      status: 'read-only',
      name: 'Ad Photos',
      ownerEmail: 'elevatedtreesolutions23@gmail.com',
    })
    expect(msg?.tone).toBe('error')
    expect(msg?.text).toContain('Ad Photos')
    expect(msg?.text).toContain('elevatedtreesolutions23@gmail.com')
    expect(msg?.text).toMatch(/read only/i)
  })

  it('handles a read-only folder with no owner on record', () => {
    const msg = assetsFolderCheckMessage({
      status: 'read-only',
      name: 'Ad Photos',
      ownerEmail: null,
    })
    expect(msg?.text).toContain('Ad Photos')
    expect(msg?.text).not.toContain('null')
  })

  it('flags a link that points at a file rather than a folder', () => {
    const msg = assetsFolderCheckMessage({ status: 'not-a-folder', name: 'Brand deck.pdf' })
    expect(msg?.tone).toBe('error')
    expect(msg?.text).toContain('Brand deck.pdf')
  })

  it('flags a link that is not a Drive folder link at all', () => {
    const msg = assetsFolderCheckMessage({ status: 'unparseable' })
    expect(msg?.tone).toBe('error')
    expect(msg?.text).toMatch(/drive\.google\.com/i)
  })

  it('distinguishes a missing folder from one Relay was never given', () => {
    const missing = assetsFolderCheckMessage({ status: 'not-found' })?.text ?? ''
    const noAccess = assetsFolderCheckMessage({ status: 'no-access' })?.text ?? ''
    expect(missing).not.toBe(noAccess)
    expect(noAccess).toMatch(/share|access/i)
  })

  it('reports an unexpected fault without claiming the link is wrong', () => {
    const msg = assetsFolderCheckMessage({ status: 'error', message: 'socket hang up' })
    expect(msg?.tone).toBe('warning')
    expect(msg?.text).toContain('socket hang up')
  })
})
