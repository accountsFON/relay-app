import { NextResponse, type NextRequest } from 'next/server'
import { requireOrgContext } from '@/server/middleware/auth'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { AVATAR_PREFIX } from '@/lib/avatar'

/**
 * POST /api/account/avatar/upload
 *
 * SDK mode only (@vercel/blob/client.upload with handleUploadUrl pointing here).
 * Any signed-in user may upload, but ONLY under their own
 * `user-avatars/<userDbId>/` prefix. The prefix is enforced server-side in
 * onBeforeGenerateToken against the authenticated ctx, independent of the
 * client-chosen pathname.
 */
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const ctx = await requireOrgContext()
  const ownPrefix = `${AVATAR_PREFIX}/${ctx.userDbId}/`

  const json = await handleUpload({
    body: body as HandleUploadBody,
    request: req,
    onBeforeGenerateToken: async (pathname: string) => {
      if (!pathname.startsWith(ownPrefix)) {
        throw new Error('Forbidden: pathname outside caller avatar prefix')
      }
      return {
        allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp'],
        // Enforce the size cap where the token is signed, not just in the
        // browser, so a direct POST can't upload an oversized blob.
        maximumSizeInBytes: 5 * 1024 * 1024,
        addRandomSuffix: true,
      }
    },
    onUploadCompleted: async () => {
      // No-op. Browser calls updateMyAvatarAction with the result URL.
    },
  })
  return NextResponse.json(json)
}
