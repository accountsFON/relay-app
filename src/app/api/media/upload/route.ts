import { NextResponse, type NextRequest } from 'next/server'
import { findPostById } from '@/server/repositories/posts'
import { requirePostMediaEditor } from '@/server/middleware/permissions'
import { getSignedUploadUrl, buildBlobPathname } from '@/lib/media'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'

/**
 * POST /api/media/upload
 *
 * Two modes share this route:
 *
 *  1. SDK mode (browser uses @vercel/blob/client.upload() with
 *     handleUploadUrl: '/api/media/upload'). Body shape is the SDK's
 *     HandleUploadBody envelope. The clientPayload carries the postId so
 *     onBeforeGenerateToken can authorize.
 *
 *  2. Direct mode (legacy / non-SDK callers). Body shape is { postId, filename }.
 *     Returns { url, blobUrl }. Uses stub URLs when BLOB_READ_WRITE_TOKEN is
 *     unset (test + local dev).
 *
 * Permission: SDK mode is authorized inside onBeforeGenerateToken via
 * findPostById. Direct mode is authorized at the top of this handler via
 * requirePostMediaEditor + findPostById (matches the pattern used by
 * src/server/actions/posts.ts updatePostAction).
 */
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    )
  }

  const isSdkBody =
    body !== null &&
    typeof body === 'object' &&
    'type' in (body as Record<string, unknown>) &&
    typeof (body as { type?: unknown }).type === 'string'

  if (isSdkBody) {
    // SDK mode: handleUpload signs a token. Auth happens inside
    // onBeforeGenerateToken (postId arrives via clientPayload).
    const ctx = await requirePostMediaEditor()
    const json = await handleUpload({
      body: body as HandleUploadBody,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const postId = typeof clientPayload === 'string' ? clientPayload : null
        if (!postId) throw new Error('Missing postId in clientPayload')
        const post = await findPostById(postId, ctx)
        if (!post) throw new Error('Forbidden: post not found or no access')
        return {
          allowedContentTypes: [
            'image/png',
            'image/jpeg',
            'image/webp',
            'image/gif',
          ],
          addRandomSuffix: true,
        }
      },
      onUploadCompleted: async () => {
        // No-op. Browser POSTs the result URL to /api/posts/[id]/media.
      },
    })
    return NextResponse.json(json)
  }

  // Direct mode: { postId, filename } → { url, blobUrl }
  const directBody = body as { postId?: unknown; filename?: unknown }
  const postId =
    typeof directBody.postId === 'string' ? directBody.postId : null
  const filename =
    typeof directBody.filename === 'string' ? directBody.filename : null
  if (!postId || !filename) {
    return NextResponse.json(
      { error: 'postId and filename are required' },
      { status: 400 },
    )
  }

  const ctx = await requirePostMediaEditor()
  const post = await findPostById(postId, ctx)
  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  // In stub mode, getSignedUploadUrl returns a deterministic fake.
  // In live mode without an SDK envelope it would throw, so direct mode is
  // primarily for test + non-SDK fallback callers.
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    // Live live: return a placeholder envelope that points the caller at
    // the SDK pattern. We don't sign a raw token here because the SDK is
    // the supported integration shape.
    return NextResponse.json({
      url: `${req.nextUrl.origin}/api/media/upload`,
      blobUrl: `https://blob.vercel-storage.com/${buildBlobPathname(postId, filename)}`,
    })
  }

  const result = await getSignedUploadUrl({ postId, filename })
  return NextResponse.json(result)
}
