// Server-free: no '@/db/client' import (the client uploader + the route + the
// action all import from here). Mirrors src/lib/avatar.ts.

export const COMMENT_IMAGE_PREFIX = 'comment-images'

/**
 * Shared onBeforeGenerateToken return value for both comment-image upload
 * routes (AM + reviewer).  Centralised here so the content-type allow-list
 * and size cap stay in sync automatically.
 */
export const COMMENT_IMAGE_UPLOAD_TOKEN_OPTIONS = {
  allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  maximumSizeInBytes: 5 * 1024 * 1024, // 5 MB
  addRandomSuffix: true,
}

function safe(filename: string): string {
  return filename.replace(/[\\/]+/g, '_')
}

/** comment-images/am/<userDbId>/<ts>-<safeName> */
export function buildAmCommentImagePathname(userDbId: string, filename: string): string {
  return `${COMMENT_IMAGE_PREFIX}/am/${userDbId}/${Date.now()}-${safe(filename)}`
}

/** comment-images/review/<tokenHash>/<ts>-<safeName> */
export function buildReviewerCommentImagePathname(tokenHash: string, filename: string): string {
  return `${COMMENT_IMAGE_PREFIX}/review/${tokenHash}/${Date.now()}-${safe(filename)}`
}

/**
 * True only for an https Vercel Blob URL whose path sits under comment-images/.
 * Used to reject arbitrary external URLs before persisting to PostComment.
 */
export function isCommentImageBlobUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  // Real: <id>.public.blob.vercel-storage.com ; stub tests: *.vercel-storage.test
  if (!/\.vercel-storage\.(com|test)$/.test(parsed.hostname)) return false
  return parsed.pathname.startsWith(`/${COMMENT_IMAGE_PREFIX}/`)
}
