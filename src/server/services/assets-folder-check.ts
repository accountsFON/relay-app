/**
 * Save-time validation of `Client.assetsFolderUrl`.
 *
 * Origin: the 2026-08-31 Elevated Tree Solutions incident. That client's assets
 * folder URL pointed at "Ad Photos", a read-only folder in the CLIENT's own
 * personal Google Drive (their raw photo dump, shared with us to look at). The
 * field accepted it silently, and the mistake only surfaced weeks later when
 * the relay finished and Drive refused to create the month folder. An audit the
 * same day found Dixie Lily Foods with the identical mistake, not yet triggered.
 *
 * `canAddChildren` is the one field that separates a usable folder from that
 * failure, and asking for it costs one Drive read at save time.
 *
 * Contract: this NEVER throws. A Drive outage must not stop someone saving a
 * client, so every failure collapses into a status the caller can render.
 */
import {
  getDriveClient,
  inspectFolder,
  parseDriveFolderId,
  DriveConfigError,
} from '@/lib/google-drive'

export type AssetsFolderCheck =
  /** Writable. `inSharedDrive` is false for a writable folder in a personal Drive. */
  | { status: 'ok'; name: string; inSharedDrive: boolean }
  /** No URL set. Nothing to validate, and not an error. */
  | { status: 'empty' }
  /** Not a Drive folder link (a Dropbox link, a bare sentence, and so on). */
  | { status: 'unparseable' }
  /** The id resolves to a file. Someone pasted a document link. */
  | { status: 'not-a-folder'; name: string }
  /** Readable and NOT writable. The Elevated Tree Solutions case. */
  | { status: 'read-only'; name: string; ownerEmail: string | null }
  /** Drive 404. Deleted, or an id that was never real. */
  | { status: 'not-found' }
  /** Drive 403. The folder exists and the service account was never given it. */
  | { status: 'no-access' }
  /** No service-account key in this environment. Checking is impossible, so stay quiet. */
  | { status: 'not-configured' }
  /** Anything else (network, quota). Reported without blocking the save. */
  | { status: 'error'; message: string }

/** True when the check found a problem worth telling the user about. */
export function isAssetsFolderProblem(check: AssetsFolderCheck): boolean {
  return (
    check.status === 'unparseable' ||
    check.status === 'not-a-folder' ||
    check.status === 'read-only' ||
    check.status === 'not-found' ||
    check.status === 'no-access'
  )
}

function statusCode(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null
  const code = (err as { code?: unknown; status?: unknown }).code ?? (err as { status?: unknown }).status
  return typeof code === 'number' ? code : null
}

export async function checkAssetsFolder(
  url: string | null | undefined,
): Promise<AssetsFolderCheck> {
  if (!url || !url.trim()) return { status: 'empty' }

  const folderId = parseDriveFolderId(url)
  if (!folderId) return { status: 'unparseable' }

  let drive
  try {
    drive = await getDriveClient()
  } catch (err) {
    if (err instanceof DriveConfigError) return { status: 'not-configured' }
    return { status: 'error', message: err instanceof Error ? err.message : String(err) }
  }

  let info
  try {
    info = await inspectFolder(drive, folderId)
  } catch (err) {
    const code = statusCode(err)
    if (code === 404) return { status: 'not-found' }
    if (code === 403) return { status: 'no-access' }
    return { status: 'error', message: err instanceof Error ? err.message : String(err) }
  }

  if (!info.isFolder) return { status: 'not-a-folder', name: info.name }
  if (!info.canAddChildren) {
    return { status: 'read-only', name: info.name, ownerEmail: info.ownerEmail }
  }
  return { status: 'ok', name: info.name, inSharedDrive: info.sharedDriveId !== null }
}
