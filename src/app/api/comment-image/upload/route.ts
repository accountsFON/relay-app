import { NextResponse, type NextRequest } from 'next/server'
import { requireOrgContext } from '@/server/middleware/auth'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { COMMENT_IMAGE_PREFIX, COMMENT_IMAGE_UPLOAD_TOKEN_OPTIONS } from '@/lib/comment-image'

/**
 * POST /api/comment-image/upload
 *
 * SDK mode (@vercel/blob/client.upload). Any signed-in user may upload, but
 * ONLY under their own `comment-images/am/<userDbId>/` prefix, enforced
 * server-side in onBeforeGenerateToken regardless of the client-chosen pathname.
 */
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const ctx = await requireOrgContext()
  const ownPrefix = `${COMMENT_IMAGE_PREFIX}/am/${ctx.userDbId}/`

  const json = await handleUpload({
    body: body as HandleUploadBody,
    request: req,
    onBeforeGenerateToken: async (pathname: string) => {
      if (!pathname.startsWith(ownPrefix)) {
        throw new Error('Forbidden: pathname outside caller comment-image prefix')
      }
      return COMMENT_IMAGE_UPLOAD_TOKEN_OPTIONS
    },
    onUploadCompleted: async () => {},
  })
  return NextResponse.json(json)
}
