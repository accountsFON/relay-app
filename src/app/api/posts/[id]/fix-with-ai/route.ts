import { NextResponse, type NextRequest } from 'next/server'
import { findPostById } from '@/server/repositories/posts'
import { requireClientEditor } from '@/server/middleware/permissions'
import {
  proposeFix,
  FixWithAiPostNotFoundError,
  FixWithAiThreadMismatchError,
} from '@/server/services/fixWithAi'

/**
 * POST /api/posts/[id]/fix-with-ai
 *
 * Body: { threadId: string }
 *
 * Auth: AM only (Clerk + client.edit). Magic-link reviewers cannot trigger
 * AI rewrites in v1 (cost + abuse vector — see design doc § Non-goals).
 *
 * Returns the proposal shape:
 *   { proposedCaption, diff: DiffSegment[], tokenUsage: { in, out, costUsd } }
 *
 * No DB writes here. AM either calls /accept next or closes the modal.
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
  if (!threadId) {
    return NextResponse.json(
      { error: 'threadId is required' },
      { status: 400 },
    )
  }

  const ctx = await requireClientEditor()
  const existing = await findPostById(postId, ctx.userDbId)
  if (!existing) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  try {
    const result = await proposeFix({ postId, threadId })
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
    return NextResponse.json(
      { error: 'Fix with AI failed' },
      { status: 500 },
    )
  }
}
