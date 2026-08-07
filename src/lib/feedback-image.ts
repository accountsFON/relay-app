// Server-free: no '@/db/client' import (the client uploader, the upload route,
// and the feedback action all import from here). Mirrors src/lib/comment-image.ts.

export const FEEDBACK_IMAGE_PREFIX = 'feedback-images'

/**
 * Shared onBeforeGenerateToken return value for the feedback screenshot
 * upload route. Same content-type allow-list + 5 MB cap as comment images.
 */
export const FEEDBACK_IMAGE_UPLOAD_TOKEN_OPTIONS = {
  allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  maximumSizeInBytes: 5 * 1024 * 1024, // 5 MB
  addRandomSuffix: true,
}

function safe(filename: string): string {
  return filename.replace(/[\\/]+/g, '_')
}

/**
 * feedback-images/<ts>-<safeName>
 *
 * Feedback screenshots are low-risk operational data, so the path is not
 * per-user scoped (the upload route still requires an authenticated user).
 * `addRandomSuffix` prevents collisions.
 */
export function buildFeedbackImagePathname(filename: string): string {
  return `${FEEDBACK_IMAGE_PREFIX}/${Date.now()}-${safe(filename)}`
}

/**
 * True only for an https Vercel Blob URL whose path sits under
 * feedback-images/. Used to reject arbitrary external URLs before persisting
 * to Feedback.imageUrl.
 */
export function isFeedbackImageBlobUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  // Real: <id>.public.blob.vercel-storage.com ; stub tests: *.vercel-storage.test
  if (!/\.vercel-storage\.(com|test)$/.test(parsed.hostname)) return false
  return parsed.pathname.startsWith(`/${FEEDBACK_IMAGE_PREFIX}/`)
}
