import { NextResponse, type NextRequest } from 'next/server'
import { findPostById } from '@/server/repositories/posts'
import { requireClientEditor } from '@/server/middleware/permissions'
import {
  proposeFix,
  proposeFixForPost,
  FixWithAiPostNotFoundError,
  FixWithAiThreadMismatchError,
} from '@/server/services/fixWithAi'

/**
 * POST /api/posts/[id]/fix-with-ai
 *
 * Body: { threadId?: string }
 *   - with threadId  -> rewrite from that one pin's comments (per-pin)
 *   - without        -> rewrite from ALL the post's client feedback (per-post)
 *
 * Auth: AM only (Clerk + client.edit). No DB writes.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: postId } = await params

  let body: { threadId?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const threadId = typeof body.threadId === 'string' ? body.threadId : null

  const ctx = await requireClientEditor()
  const existing = await findPostById(postId, ctx)
  if (!existing) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  try {
    const result = threadId
      ? await proposeFix({ postId, threadId })
      : await proposeFixForPost({ postId })
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
    console.error('[fix-with-ai] proposeFix failed', err)
    return NextResponse.json({ error: 'Fix with AI failed' }, { status: 500 })
  }
}
