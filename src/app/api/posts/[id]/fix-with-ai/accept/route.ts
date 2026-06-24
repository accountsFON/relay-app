import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { findPostById } from '@/server/repositories/posts'
import { requireClientEditor } from '@/server/middleware/permissions'
import {
  acceptFix,
  acceptFixForPost,
  FixWithAiPostNotFoundError,
  FixWithAiThreadMismatchError,
} from '@/server/services/fixWithAi'

/**
 * POST /api/posts/[id]/fix-with-ai/accept
 *
 * Body: { threadId?: string, proposedCaption: string }
 *   - with threadId  -> acceptFix (resolves that thread)
 *   - without        -> acceptFixForPost (no thread resolution)
 *
 * Auth: AM only. Writes a new PostVersion + updates Post.caption + emits
 * post_caption_ai_fixed.
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
  if (proposedCaption === null) {
    return NextResponse.json(
      { error: 'proposedCaption is required' },
      { status: 400 },
    )
  }

  const ctx = await requireClientEditor()
  const existing = await findPostById(postId, ctx)
  if (!existing) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  try {
    const result = threadId
      ? await acceptFix({ postId, threadId, proposedCaption, acceptedBy: ctx.userDbId })
      : await acceptFixForPost({ postId, proposedCaption, acceptedBy: ctx.userDbId })
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
    return NextResponse.json({ error: 'Accept fix failed' }, { status: 500 })
  }
}
