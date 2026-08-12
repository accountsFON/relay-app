/**
 * Upload a batch's final post graphics into the client's shared Google Drive,
 * grouped into a "Month Year" folder. Called best-effort from the relay-finish
 * action (see finishBatchAction) and from a manual retry.
 *
 * Best effort by contract: this never throws for expected conditions (no
 * folder, no images, Drive not configured, per-image failures). The caller
 * treats a thrown error as an unexpected failure but must not let it roll back
 * the relay completion.
 *
 * Spec: docs/superpowers/specs/2026-08-11-drive-graphics-upload-design.md
 */
import { db } from '@/db/client'
import {
  getDriveClient,
  parseDriveFolderId,
  findOrCreateFolder,
  upsertImage,
  DriveConfigError,
} from '@/lib/google-drive'
import { resolveBatchTargetMonth, formatMonthYear } from '@/lib/batch-target-month'

export type DriveUploadResult =
  | { status: 'skipped'; reason: 'no-folder' | 'no-images' | 'not-configured' }
  | {
      status: 'ok' | 'partial' | 'failed'
      folderUrl: string | null
      month: string
      uploaded: number
      overwritten: number
      failed: { name: string; reason: string }[]
    }

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function normalizeContentType(ct: string | null): string {
  return ct?.split(';')[0].trim().toLowerCase() ?? ''
}

function extFromContentType(ct: string): string | null {
  return EXT_BY_TYPE[ct] ?? null
}

function extFromUrl(url: string): string {
  const match = url.split('?')[0].match(/\.([a-zA-Z0-9]{2,5})$/)
  return match ? `.${match[1].toLowerCase()}` : '.jpg'
}

async function fetchImage(
  url: string,
): Promise<{ bytes: Buffer; contentType: string; ext: string }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch failed (${res.status})`)
  const ct = normalizeContentType(res.headers.get('content-type'))
  const bytes = Buffer.from(await res.arrayBuffer())
  const ext = extFromContentType(ct) ?? extFromUrl(url)
  return { bytes, contentType: ct || 'application/octet-stream', ext }
}

/**
 * Upload every post graphic on the batch into the client's Drive assets folder,
 * inside a "Month Year" subfolder (find-or-create). Files are named by 1-based
 * post order (`01`, `02`, ...); a post with multiple images gets `01-1`,
 * `01-2`. Existing files of the same name are overwritten.
 *
 * `now` is injectable for deterministic month resolution in tests.
 */
export async function uploadPostGraphicsToDrive(
  batchId: string,
  now: Date = new Date(),
): Promise<DriveUploadResult> {
  const batch = await db.batch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      label: true,
      createdAt: true,
      client: { select: { assetsFolderUrl: true } },
    },
  })
  const folderId = batch ? parseDriveFolderId(batch.client.assetsFolderUrl) : null
  if (!batch || !folderId) return { status: 'skipped', reason: 'no-folder' }

  const posts = await db.post.findMany({
    where: { batchId, deletedAt: null },
    orderBy: { postDate: 'asc' },
    select: { id: true, postDate: true, mediaUrls: true },
  })
  const withImages = posts.filter((p) => p.mediaUrls.length > 0)
  if (withImages.length === 0) return { status: 'skipped', reason: 'no-images' }

  let drive
  try {
    drive = await getDriveClient()
  } catch (err) {
    if (err instanceof DriveConfigError) return { status: 'skipped', reason: 'not-configured' }
    throw err
  }

  const runPost = await db.post.findFirst({
    where: { batchId },
    orderBy: { contentRun: { createdAt: 'desc' } },
    select: { contentRun: { select: { targetMonth: true } } },
  })
  const month = formatMonthYear(
    resolveBatchTargetMonth(
      { label: batch.label, createdAt: batch.createdAt },
      runPost?.contentRun ?? null,
      now,
    ),
  )

  let uploaded = 0
  let overwritten = 0
  const failed: { name: string; reason: string }[] = []
  let folderUrl: string | null = null

  let folder
  try {
    folder = await findOrCreateFolder(drive, { parentId: folderId, name: month })
    folderUrl = folder.url
  } catch (err) {
    return {
      status: 'failed',
      folderUrl: null,
      month,
      uploaded: 0,
      overwritten: 0,
      failed: [{ name: `(folder ${month})`, reason: err instanceof Error ? err.message : String(err) }],
    }
  }

  for (let i = 0; i < withImages.length; i++) {
    const post = withImages[i]
    const num = i + 1
    const multi = post.mediaUrls.length > 1
    for (let j = 0; j < post.mediaUrls.length; j++) {
      const base = multi ? `${pad(num)}-${j + 1}` : pad(num)
      let name = base
      try {
        const { bytes, contentType, ext } = await fetchImage(post.mediaUrls[j])
        name = base + ext
        const res = await upsertImage(drive, {
          folderId: folder.id,
          name,
          contentType,
          bytes,
        })
        if (res.overwritten) overwritten++
        else uploaded++
      } catch (err) {
        failed.push({ name, reason: err instanceof Error ? err.message : String(err) })
      }
    }
  }

  const anySucceeded = uploaded + overwritten > 0
  const status = failed.length === 0 ? 'ok' : anySucceeded ? 'partial' : 'failed'
  return { status, folderUrl, month, uploaded, overwritten, failed }
}
