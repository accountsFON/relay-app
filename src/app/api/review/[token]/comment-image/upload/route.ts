/**
 * POST /api/review/[token]/comment-image/upload
 *
 * Magic-link reviewer (NO Clerk). Authenticated by the signed
 * `magic-link-session` cookie; the cookie's reviewer must belong to the same
 * link as the URL token. Uploads are forced under
 * `comment-images/review/<tokenHash>/`. The route is under /review/, so the
 * middleware also validates the URL token (defense in depth).
 *
 * Trust chain:
 *  1. Signed cookie verified by getMagicLinkReviewerFromCookie (HMAC + DB lookup)
 *  2. hashToken(urlToken) must match reviewer.tokenHash (binds cookie to URL)
 *  3. onBeforeGenerateToken enforces per-reviewer blob prefix (server-side)
 *  4. Content-type allow-list + 5 MB cap signed into the upload token
 *
 * This is the ONLY upload path open to a token-only (non-Clerk) client.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { getMagicLinkReviewerFromCookie } from '@/server/auth/magic-link-reviewer'
import { hashToken } from '@/lib/magic-link'
import { COMMENT_IMAGE_PREFIX, COMMENT_IMAGE_UPLOAD_TOKEN_OPTIONS } from '@/lib/comment-image'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  // 1. Parse body first so we return 400 before doing any auth work on
  //    completely malformed requests.
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // 2. Verify the signed magic-link cookie.
  const reviewer = await getMagicLinkReviewerFromCookie()
  if (!reviewer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 3. Bind cookie to the URL token: the hash of the URL token must match the
  //    tokenHash stored on the reviewer's link.  This prevents a reviewer from
  //    one link uploading files on behalf of a different link's URL.
  const { token } = await params
  if (hashToken(token) !== reviewer.tokenHash) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 4. Derive the per-reviewer blob prefix the client is allowed to upload to.
  const ownPrefix = `${COMMENT_IMAGE_PREFIX}/review/${reviewer.tokenHash}/`

  const json = await handleUpload({
    body: body as HandleUploadBody,
    request: req,
    onBeforeGenerateToken: async (pathname: string) => {
      // Server-enforced prefix check: the client-side uploader sends the
      // desired pathname; we reject any path outside this reviewer's own
      // subdirectory before we issue a signed upload token.
      if (!pathname.startsWith(ownPrefix)) {
        throw new Error('Forbidden: pathname outside reviewer comment-image prefix')
      }
      return COMMENT_IMAGE_UPLOAD_TOKEN_OPTIONS
    },
    onUploadCompleted: async () => {
      // No-op: we persist the blob URL on the comment create/update call,
      // not here.  Vercel Blob requires the callback to exist.
    },
  })

  return NextResponse.json(json)
}
