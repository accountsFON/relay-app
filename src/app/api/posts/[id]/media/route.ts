import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { findPostById } from '@/server/repositories/posts'
import { requireClientEditor } from '@/server/middleware/permissions'
import { attachMediaToPost } from '@/lib/media'

/**
 * POST /api/posts/[id]/media
 *
 * Body: { url: string }
 *
 * Writes the URL into Post.mediaUrls[0]. Caller is the browser, having just
 * uploaded the file directly to Vercel Blob using the signed token from
 * /api/media/upload. Returns the updated post.
 *
 * Auth: same shape as /api/media/upload, requireClientEditor + org-scoped
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
  if (!url) {
    return NextResponse.json(
      { error: 'url is required' },
      { status: 400 },
    )
  }

  const ctx = await requireClientEditor()
  const existing = await findPostById(postId, ctx.userDbId)
  if (!existing) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  const updated = await attachMediaToPost({ postId, url })
  revalidatePath('/', 'layout')
  return NextResponse.json(updated)
}
