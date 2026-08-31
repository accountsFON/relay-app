/**
 * Thin wrapper around the Google Drive v3 API for the graphics-upload feature.
 *
 * Design: `getDriveClient()` builds the authenticated client from the service
 * account key; every other function takes the `DriveClient` as a parameter so
 * the logic is unit-testable with a mock and nothing else in the app imports
 * googleapis. googleapis is loaded lazily inside `getDriveClient()` (dynamic
 * import) so importing this module for the pure helpers does not pull the heavy
 * package into the test/runtime graph.
 *
 * All calls pass `supportsAllDrives` / `includeItemsFromAllDrives` so the agency
 * Shared Drive (Team Drive) is handled correctly.
 *
 * Spec: docs/superpowers/specs/2026-08-11-drive-graphics-upload-design.md
 */
import { Readable } from 'node:stream'
import type { drive_v3 } from 'googleapis'

export type DriveClient = drive_v3.Drive

/** Thrown when the service-account env is missing or malformed. */
export class DriveConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DriveConfigError'
  }
}

interface ServiceAccountKey {
  client_email: string
  private_key: string
}

/**
 * Decode `GOOGLE_DRIVE_SA_KEY`. Accepts either raw JSON (starts with `{`) or a
 * base64-encoded JSON string (the form we store, to avoid newline breakage in
 * the private key). Throws `DriveConfigError` on any problem.
 */
export function decodeServiceAccountKey(raw: string | undefined | null): ServiceAccountKey {
  if (!raw || !raw.trim()) {
    throw new DriveConfigError('GOOGLE_DRIVE_SA_KEY is not set')
  }
  let jsonStr = raw.trim()
  if (!jsonStr.startsWith('{')) {
    try {
      jsonStr = Buffer.from(jsonStr, 'base64').toString('utf8')
    } catch {
      throw new DriveConfigError('GOOGLE_DRIVE_SA_KEY is not valid base64')
    }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new DriveConfigError('GOOGLE_DRIVE_SA_KEY is not valid JSON')
  }
  const key = parsed as Partial<ServiceAccountKey>
  if (!key.client_email || !key.private_key) {
    throw new DriveConfigError('service account key is missing client_email or private_key')
  }
  return { client_email: key.client_email, private_key: key.private_key }
}

/**
 * Build an authenticated Drive v3 client from the service-account key. Lazy
 * dynamic import of googleapis keeps it out of the module graph for callers
 * that only use the pure helpers.
 */
export async function getDriveClient(): Promise<DriveClient> {
  const { google } = await import('googleapis')
  const key = decodeServiceAccountKey(process.env.GOOGLE_DRIVE_SA_KEY)
  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
  return google.drive({ version: 'v3', auth })
}

/**
 * Extract a Drive folder id from a stored `assetsFolderUrl`. Handles the
 * `/folders/{id}` share URL, a `?id={id}` query form, and a bare id. Returns
 * null when nothing folder-like is present.
 */
export function parseDriveFolderId(url: string | null | undefined): string | null {
  if (!url) return null
  const s = url.trim()
  const folders = s.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (folders) return folders[1]
  const idParam = s.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (idParam) return idParam[1]
  // A bare id: no slashes, drive-id-like length/charset.
  if (/^[a-zA-Z0-9_-]{10,}$/.test(s)) return s
  return null
}

/** What Drive knows about one folder id, reduced to what we act on. */
export interface DriveFolderInfo {
  id: string
  name: string
  /** False when the id resolves to a file (a doc link pasted by mistake). */
  isFolder: boolean
  /** False when we can read the folder but cannot create anything inside it. */
  canAddChildren: boolean
  /** The Shared Drive it lives in, or null when it sits in someone's My Drive. */
  sharedDriveId: string | null
  /** Owner of a personal-Drive folder. Null on Shared Drive items, which have no owner. */
  ownerEmail: string | null
}

/**
 * Read one folder's identity and whether the service account may write into it.
 *
 * Exists because of the 2026-08-31 Elevated Tree Solutions upload failure: the
 * client's `assetsFolderUrl` pointed at a read-only folder in the client's own
 * personal Drive, and nothing ever asked Drive whether that folder was usable,
 * so the answer surfaced weeks later as a failed relay upload. `canAddChildren`
 * is the single field that would have caught it at save time.
 *
 * Throws whatever the Drive API throws (404 / 403). Callers classify.
 */
export async function inspectFolder(
  drive: DriveClient,
  folderId: string,
): Promise<DriveFolderInfo> {
  const res = await drive.files.get({
    fileId: folderId,
    fields: 'id,name,mimeType,driveId,capabilities(canAddChildren),owners(emailAddress)',
    supportsAllDrives: true,
  })
  const d = res.data
  return {
    id: d.id ?? folderId,
    name: d.name ?? '',
    isFolder: d.mimeType === FOLDER_MIME,
    canAddChildren: d.capabilities?.canAddChildren === true,
    sharedDriveId: d.driveId ?? null,
    ownerEmail: d.owners?.[0]?.emailAddress ?? null,
  }
}

/** Escape a value for use inside a Drive `q` string literal. */
function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

const FOLDER_MIME = 'application/vnd.google-apps.folder'

/**
 * Find a non-trashed folder of `name` directly under `parentId`, or create it.
 * Idempotent: a second call with the same name returns the existing folder.
 */
export async function findOrCreateFolder(
  drive: DriveClient,
  { parentId, name }: { parentId: string; name: string },
): Promise<{ id: string; url: string; created: boolean }> {
  const q =
    `name = '${escapeDriveQueryValue(name)}' and ` +
    `mimeType = '${FOLDER_MIME}' and ` +
    `'${parentId}' in parents and trashed = false`
  const existing = await drive.files.list({
    q,
    fields: 'files(id, name)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  const found = existing.data.files?.[0]
  if (found?.id) {
    return { id: found.id, url: folderUrl(found.id), created: false }
  }
  const created = await drive.files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: 'id',
    supportsAllDrives: true,
  })
  const id = created.data.id
  if (!id) throw new Error('Drive folder create returned no id')
  return { id, url: folderUrl(id), created: true }
}

/**
 * Upload a file into `folderId`. If a non-trashed file of the same name already
 * exists there, overwrite its content (the re-run decision); otherwise create
 * it. Returns the file id.
 */
export async function upsertImage(
  drive: DriveClient,
  {
    folderId,
    name,
    contentType,
    bytes,
  }: { folderId: string; name: string; contentType: string; bytes: Buffer | Uint8Array },
): Promise<{ id: string; overwritten: boolean }> {
  const q =
    `name = '${escapeDriveQueryValue(name)}' and ` +
    `'${folderId}' in parents and trashed = false`
  const existing = await drive.files.list({
    q,
    fields: 'files(id)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  const existingId = existing.data.files?.[0]?.id
  if (existingId) {
    await drive.files.update({
      fileId: existingId,
      media: { mimeType: contentType, body: Readable.from(bytes) },
      supportsAllDrives: true,
    })
    return { id: existingId, overwritten: true }
  }
  const created = await drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType: contentType, body: Readable.from(bytes) },
    fields: 'id',
    supportsAllDrives: true,
  })
  const id = created.data.id
  if (!id) throw new Error('Drive file create returned no id')
  return { id, overwritten: false }
}

function folderUrl(id: string): string {
  return `https://drive.google.com/drive/folders/${id}`
}
