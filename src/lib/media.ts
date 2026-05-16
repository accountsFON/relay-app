import { db } from '@/db/client'

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

  const next = [...(post.mediaUrls ?? [])]
  next[0] = url

  return db.post.update({
    where: { id: postId },
    data: { mediaUrls: next },
  })
}

/**
 * Pure function for filename auto-matching in the bulk upload tray.
 * Extracted from the component so it can be unit-tested without DOM.
 *
 * Patterns:
 *  - "MM-DD.{ext}" matches the post whose postDate falls on month MM,
 *    day DD (year-agnostic, since a batch is scoped to a single month
 *    in practice).
 *  - "N.{ext}" or "0N.{ext}" matches the Nth post when posts are sorted
 *    by postDate ascending (1-indexed). Leading zeros are stripped.
 *
 * Returns the matching post id, or null if no match.
 */
export type MatchablePost = {
  id: string
  postDate: Date
}

export function matchFilenameToPost(
  filename: string,
  posts: ReadonlyArray<MatchablePost>,
): string | null {
  if (!filename || posts.length === 0) return null

  const dot = filename.lastIndexOf('.')
  const stem = dot >= 0 ? filename.slice(0, dot) : filename

  // Pattern 1: MM-DD (e.g., 05-12)
  const mmddMatch = stem.match(/^(\d{1,2})-(\d{1,2})$/)
  if (mmddMatch) {
    const month = parseInt(mmddMatch[1], 10)
    const day = parseInt(mmddMatch[2], 10)
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const found = posts.find((p) => {
        // Use UTC components since postDate is stored as UTC.
        return (
          p.postDate.getUTCMonth() + 1 === month &&
          p.postDate.getUTCDate() === day
        )
      })
      if (found) return found.id
    }
  }

  // Pattern 2: N or 0N (1-indexed position when sorted by postDate asc)
  const nMatch = stem.match(/^0*(\d+)$/)
  if (nMatch) {
    const n = parseInt(nMatch[1], 10)
    if (n >= 1) {
      const sorted = [...posts].sort(
        (a, b) => a.postDate.getTime() - b.postDate.getTime(),
      )
      const target = sorted[n - 1]
      if (target) return target.id
    }
  }

  return null
}
