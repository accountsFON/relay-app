import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { findPostById } from '@/server/repositories/posts'
import { requireClientEditor } from '@/server/middleware/permissions'
import {
  acceptFix,
  FixWithAiPostNotFoundError,
  FixWithAiThreadMismatchError,
} from '@/server/services/fixWithAi'

/**
 * POST /api/posts/[id]/fix-with-ai/accept
 *
 * Body: { threadId: string, proposedCaption: string }
 *
 * Auth: AM only (Clerk + client.edit). Writes a new PostVersion, updates
 * Post.caption, auto-resolves the originating thread, and emits a
 * post_caption_ai_fixed ActivityEvent.
 *
 * Returns: { postVersionId: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: postId } = await params

  let body: { threadId?: unknown; proposedCaption?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const threadId = typeof body.threadId === 'string' ? body.threadId : null
  const proposedCaption =
    typeof body.proposedCaption === 'string' ? body.proposedCaption : null
  if (!threadId || proposedCaption === null) {
    return NextResponse.json(
      { error: 'threadId and proposedCaption are required' },
      { status: 400 },
    )
  }

  const ctx = await requireClientEditor()
  const existing = await findPostById(postId, ctx)
  if (!existing) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  try {
    const result = await acceptFix({
      postId,
      threadId,
      proposedCaption,
      acceptedBy: ctx.userDbId,
    })
    revalidatePath('/', 'layout')
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof FixWithAiPostNotFoundError) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }
    if (err instanceof FixWithAiThreadMismatchError) {
      return NextResponse.json(
        { error: 'Thread does not belong to this post' },
        { status: 400 },
      )
    }
    console.error('[fix-with-ai/accept] acceptFix failed', err)
    return NextResponse.json(
      { error: 'Accept fix failed' },
      { status: 500 },
    )
  }
}
