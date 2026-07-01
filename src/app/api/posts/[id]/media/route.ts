import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { findPostById } from '@/server/repositories/posts'
import { requirePostMediaEditor } from '@/server/middleware/permissions'
import { attachMediaToPost } from '@/lib/media'
import { assertBatchEditable, RelayCompletedError } from '@/server/lib/relay-lock-guard'

/**
 * POST /api/posts/[id]/media
 *
 * Body: { url: string }
 *
 * Writes the URL into Post.mediaUrls[0]. Caller is the browser, having just
 * uploaded the file directly to Vercel Blob using the signed token from
 * /api/media/upload. Returns the updated post.
 *
 * Auth: same shape as /api/media/upload, requirePostMediaEditor + client-scoped
 * findPostById to prevent cross-org writes.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: postId } = await params

  let body: { url?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    )
  }

  const url = typeof body.url === 'string' ? body.url : null
  if (url === null) {
    return NextResponse.json(
      { error: 'url is required' },
      { status: 400 },
    )
  }

  const ctx = await requirePostMediaEditor()
  const existing = await findPostById(postId, ctx)
  if (!existing) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  try {
    await assertBatchEditable(existing.batchId)
  } catch (e) {
    if (e instanceof RelayCompletedError) {
      return NextResponse.json({ error: e.message }, { status: 409 })
    }
    throw e
  }

  const updated = await attachMediaToPost({ postId, url })
  revalidatePath('/', 'layout')
  return NextResponse.json(updated)
}
