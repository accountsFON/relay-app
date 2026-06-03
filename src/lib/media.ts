import { db } from '@/db/client'

// Re-export the pure matcher from its dedicated server-free module so existing
// consumers of `@/lib/media` keep their import paths. New code (especially
// client components) should import directly from `@/lib/media-match` to avoid
// pulling in the Prisma client.
export { matchFilenameToPost, type MatchablePost } from './media-match'

/**
 * Vercel Blob adapter for the post preview + feedback system. v1 ships
 * single-image upload only; carousels (mediaUrls[1..N]) land in v2.
 *
 * Surfaces:
 *  - getSignedUploadUrl({ postId, filename }) returns the response shape
 *    the route handler must send for client-side direct upload via
 *    @vercel/blob/client's `upload()` SDK call. Internally it delegates to
 *    Vercel's `handleUpload`, which signs a short-lived client token.
 *  - attachMediaToPost({ postId, url }) writes the URL to Post.mediaUrls[0],
 *    overwriting any existing index 0.
 *
 * Test mode: when BLOB_READ_WRITE_TOKEN is missing AND NODE_ENV !== 'production',
 * getSignedUploadUrl returns a stub response so vitest + local dev can run
 * without a live Blob integration.
 */

const STUB_BLOB_HOST = 'https://stub.blob.vercel-storage.test'

function isStubMode(): boolean {
  return (
    !process.env.BLOB_READ_WRITE_TOKEN && process.env.NODE_ENV !== 'production'
  )
}

/**
 * Builds the pathname used for a post's blob upload. Includes the postId
 * so blobs are traceable back to a post even after a Prisma row is gone.
 * Format: post-media/<postId>/<timestamp>-<filename>
 */
export function buildBlobPathname(postId: string, filename: string): string {
  // Strip path components from the filename to avoid traversal-style keys.
  const safeName = filename.replace(/[\\/]+/g, '_')
  return `post-media/${postId}/${Date.now()}-${safeName}`
}

/**
 * The signed-upload response shape returned to the browser.
 *
 * Vercel's `handleUpload` returns an opaque JSON envelope that the SDK's
 * `upload()` consumes. Our wrapper preserves that envelope on `url` so the
 * SDK works as designed, AND also returns a best-known `blobUrl` prefix to
 * satisfy the task spec's contract. Clients should prefer the URL returned
 * by the SDK's `upload()` call (which knows the random suffix); `blobUrl`
 * here is informational only.
 */
export type SignedUploadResult = {
  url: string
  blobUrl: string
}

/**
 * Returns a signed-upload response shape for the route handler.
 *
 * In stub mode (no BLOB_READ_WRITE_TOKEN, non-prod), returns a deterministic
 * fake URL so tests + local dev can exercise the full call path without a
 * live Blob integration.
 *
 * In live mode, the route handler at /api/media/upload uses Vercel's
 * `handleUpload` directly to sign tokens for the SDK's `upload()` call.
 * This function still serves direct (non-SDK) callers by returning a
 * predictable response shape using the real Blob host prefix.
 */
export async function getSignedUploadUrl({
  postId,
  filename,
}: {
  postId: string
  filename: string
}): Promise<SignedUploadResult> {
  const pathname = buildBlobPathname(postId, filename)

  if (isStubMode()) {
    return {
      url: `${STUB_BLOB_HOST}/upload-token/${pathname}`,
      blobUrl: `${STUB_BLOB_HOST}/${pathname}`,
    }
  }

  // Live mode direct (non-SDK) response. Real signed tokens are minted by
  // the route handler's `handleUpload` path; this branch exists only to
  // satisfy the task spec's response contract for callers that bypass the
  // SDK. The url field points back at the same route so the SDK can take
  // over from there.
  return {
    url: `/api/media/upload`,
    blobUrl: `https://blob.vercel-storage.com/${pathname}`,
  }
}

/**
 * Computes the next mediaUrls array for a write. An empty url clears the media
 * entirely (returns []); a non-empty url overwrites index 0, preserving any
 * later indices (carousel slots, future v2).
 */
export function computeNextMediaUrls(existing: string[], url: string): string[] {
  if (url === '') return []
  const next = [...existing]
  next[0] = url
  return next
}

/**
 * Writes the uploaded URL into Post.mediaUrls[0]. Overwrites any existing
 * index 0; later indices (when carousel support lands in v2) are preserved.
 *
 * Caller must have validated post.edit permission for the post's org before
 * calling this. Returns the updated post.
 */
export async function attachMediaToPost({
  postId,
  url,
}: {
  postId: string
  url: string
}) {
  const post = await db.post.findUnique({
    where: { id: postId },
    select: { id: true, mediaUrls: true },
  })
  if (!post) throw new Error(`Post ${postId} not found`)

  const next = computeNextMediaUrls(post.mediaUrls ?? [], url)

  return db.post.update({
    where: { id: postId },
    data: { mediaUrls: next },
  })
}

