import type { DriveUploadResult } from '@/server/services/drive-upload'
import type { AssetsFolderCheck } from '@/server/services/assets-folder-check'

/**
 * Human copy for the Google Drive graphics upload.
 *
 * Written after the 2026-08-31 Elevated Tree Solutions incident. That client's
 * `assetsFolderUrl` pointed at a read-only folder in the client's OWN personal
 * Drive (their shared photo dump) instead of the agency Shared Drive folder, so
 * `findOrCreateFolder` was refused by Google. The service captured Google's
 * actual reason in `failed[].reason` and the toast then threw it away, showing
 * only "Drive graphics upload failed." The AM had no way to learn that the fix
 * was a URL on the client profile.
 *
 * So every message here names the thing to go change.
 */

/** How the field is labelled on the client profile and the client form. */
export const ASSETS_FOLDER_FIELD_LABEL = 'Assets folder'

export type DriveFailureKind = 'permission' | 'not-found' | 'unknown'

/**
 * Bucket a raw Google Drive error string into something we can write copy for.
 * Drive returns prose, so this matches on the stable parts of the two failures
 * that actually happen to us: a 403 on a folder we can read but not write, and
 * a 404 on an id that is gone or was never real.
 */
export function classifyDriveFailure(reason: string): DriveFailureKind {
  const r = reason.toLowerCase()
  if (
    r.includes('insufficient permission') ||
    r.includes('sufficient permissions') ||
    r.includes('permission denied') ||
    r.includes('forbidden') ||
    r.includes('403')
  ) {
    return 'permission'
  }
  if (r.includes('file not found') || r.includes('not found') || r.includes('404')) {
    return 'not-found'
  }
  return 'unknown'
}

export interface DriveUploadMessage {
  tone: 'success' | 'error' | 'info'
  text: string
  /** True when re-running the upload could plausibly work. Drives the Retry action. */
  retryable: boolean
}

/**
 * Turn an upload outcome into what the AM should read. Returns null when the
 * right thing to do is stay quiet (a batch with no graphics is not news).
 *
 * `null` in means the call threw, which is a real fault rather than a refusal,
 * so that copy deliberately avoids blaming the folder.
 */
export function driveUploadMessage(
  result: DriveUploadResult | null,
): DriveUploadMessage | null {
  if (!result) {
    return {
      tone: 'error',
      text: 'Something went wrong archiving the graphics to Google Drive. Please try again.',
      retryable: true,
    }
  }

  if (result.status === 'skipped') {
    switch (result.reason) {
      case 'no-images':
        return null
      case 'no-folder':
        return {
          tone: 'info',
          text: `No Google Drive folder is set for this client, so the graphics were not archived. Add the ${ASSETS_FOLDER_FIELD_LABEL} link on the client profile.`,
          retryable: false,
        }
      case 'not-configured':
        return {
          tone: 'info',
          text: 'Google Drive upload is not configured yet, so the graphics were not archived.',
          retryable: false,
        }
    }
  }

  const total = result.uploaded + result.overwritten

  if (result.status === 'ok') {
    return {
      tone: 'success',
      text: `Archived ${total} graphic${total === 1 ? '' : 's'} to Google Drive (${result.month}).`,
      retryable: false,
    }
  }

  if (result.status === 'partial') {
    return {
      tone: 'error',
      text: `Archived ${total} graphic${total === 1 ? '' : 's'} to Google Drive (${result.month}), ${result.failed.length} failed: ${summarizeReasons(result.failed)}`,
      retryable: true,
    }
  }

  // status === 'failed': nothing landed. The first reason is the useful one,
  // because a total failure is almost always the single folder-create call.
  const reason = result.failed[0]?.reason ?? 'unknown error'
  switch (classifyDriveFailure(reason)) {
    case 'permission':
      return {
        tone: 'error',
        text: `Relay cannot add files to this client's Google Drive folder, so the graphics were not archived. The folder is read only for Relay. Check the ${ASSETS_FOLDER_FIELD_LABEL} link on the client profile and point it at the client's folder in the agency Shared Drive.`,
        retryable: true,
      }
    case 'not-found':
      return {
        tone: 'error',
        text: `This client's Google Drive folder could not be found, so the graphics were not archived. Check the ${ASSETS_FOLDER_FIELD_LABEL} link on the client profile.`,
        retryable: true,
      }
    default:
      return {
        tone: 'error',
        text: `The graphics could not be archived to Google Drive (${result.month}): ${reason}`,
        retryable: true,
      }
  }
}

/** Compact per-file reasons, deduped, capped so a toast stays readable. */
function summarizeReasons(failed: { name: string; reason: string }[]): string {
  const unique = [...new Set(failed.map((f) => f.reason))]
  const shown = unique.slice(0, 2).join('; ')
  return unique.length > 2 ? `${shown}; and ${unique.length - 2} more` : shown
}

// ---------------------------------------------------------------------------
// Save-time copy for the assets folder check (see assets-folder-check service).
// The reader is an AM who has just pasted a link and still has the right one
// available, so every problem message names what to paste instead.
// ---------------------------------------------------------------------------

export interface AssetsFolderMessage {
  /** `error` means the link will not work. `warning` means it works and looks wrong. */
  tone: 'error' | 'warning'
  text: string
}

/** Where the client folders actually live, named so the fix is findable. */
const AGENCY_FOLDER_HINT =
  "the client's folder in the agency Shared Drive (Shared drives > 1. Active Clients)"

export function assetsFolderCheckMessage(
  check: AssetsFolderCheck,
): AssetsFolderMessage | null {
  switch (check.status) {
    // Nothing to say: no link, a good link, or no way to check.
    case 'empty':
    case 'not-configured':
      return null

    case 'ok':
      return check.inSharedDrive
        ? null
        : {
            tone: 'warning',
            text: `Saved. "${check.name}" is writable, and it is not in the agency Shared Drive, so double check this is ${AGENCY_FOLDER_HINT}.`,
          }

    case 'read-only':
      return {
        tone: 'error',
        text: `Saved, and Relay cannot archive graphics here: "${check.name}" is read only for Relay${
          check.ownerEmail ? `, because it belongs to ${check.ownerEmail}` : ''
        }. This link should point at ${AGENCY_FOLDER_HINT}.`,
      }

    case 'not-a-folder':
      return {
        tone: 'error',
        text: `Saved, and this link points at a file ("${check.name}") rather than a folder. It should point at ${AGENCY_FOLDER_HINT}.`,
      }

    case 'unparseable':
      return {
        tone: 'error',
        text: `Saved, and this is not a Google Drive folder link. It should look like https://drive.google.com/drive/folders/... and point at ${AGENCY_FOLDER_HINT}.`,
      }

    case 'not-found':
      return {
        tone: 'error',
        text: `Saved, and no Google Drive folder exists at this link. It may have been deleted or moved. It should point at ${AGENCY_FOLDER_HINT}.`,
      }

    case 'no-access':
      return {
        tone: 'error',
        text: `Saved, and Relay has no access to this folder. Share it with the Relay service account, or point the link at ${AGENCY_FOLDER_HINT}.`,
      }

    case 'error':
      return {
        tone: 'warning',
        text: `Saved. Relay could not check this folder just now: ${check.message}`,
      }
  }
}
