import { describe, it, expect, vi, beforeEach } from 'vitest'

const { proposeFix, proposeFixForPost, acceptFix, acceptFixForPost } = vi.hoisted(() => ({
  proposeFix: vi.fn(),
  proposeFixForPost: vi.fn(),
  acceptFix: vi.fn(),
  acceptFixForPost: vi.fn(),
}))

vi.mock('@/server/services/fixWithAi', () => ({
  proposeFix,
  proposeFixForPost,
  acceptFix,
  acceptFixForPost,
  FixWithAiPostNotFoundError: class extends Error {},
  FixWithAiThreadMismatchError: class extends Error {},
}))
vi.mock('@/server/middleware/permissions', () => ({
  requireClientEditor: vi.fn().mockResolvedValue({ userDbId: 'user-am' }),
}))
vi.mock('@/server/repositories/posts', () => ({
  findPostById: vi.fn().mockResolvedValue({ id: 'post-1' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

function req(body: unknown) {
  return new Request('http://t/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest
}
const params = Promise.resolve({ id: 'post-1' })

describe('POST /api/posts/[id]/fix-with-ai', () => {
  beforeEach(() => {
    proposeFix.mockReset().mockResolvedValue({ proposedCaption: 'x', diff: [], tokenUsage: { in: 1, out: 1, costUsd: 0 } })
    proposeFixForPost.mockReset().mockResolvedValue({ proposedCaption: 'y', diff: [], tokenUsage: { in: 1, out: 1, costUsd: 0 } })
  })

  it('routes to proposeFix when threadId is present', async () => {
    const { POST } = await import('@/app/api/posts/[id]/fix-with-ai/route')
    await POST(req({ threadId: 'thread-1' }), { params })
    expect(proposeFix).toHaveBeenCalledWith({ postId: 'post-1', threadId: 'thread-1' })
    expect(proposeFixForPost).not.toHaveBeenCalled()
  })

  it('routes to proposeFixForPost when threadId is absent', async () => {
    const { POST } = await import('@/app/api/posts/[id]/fix-with-ai/route')
    await POST(req({}), { params })
    expect(proposeFixForPost).toHaveBeenCalledWith({ postId: 'post-1' })
    expect(proposeFix).not.toHaveBeenCalled()
  })
})

describe('POST /api/posts/[id]/fix-with-ai/accept', () => {
  beforeEach(() => {
    acceptFix.mockReset().mockResolvedValue({ postVersionId: 'v1' })
    acceptFixForPost.mockReset().mockResolvedValue({ postVersionId: 'v2' })
  })

  it('requires proposedCaption', async () => {
    const { POST } = await import('@/app/api/posts/[id]/fix-with-ai/accept/route')
    const res = await POST(req({ threadId: 't' }), { params })
    expect(res.status).toBe(400)
  })

  it('routes to acceptFix with threadId, acceptFixForPost without', async () => {
    const { POST } = await import('@/app/api/posts/[id]/fix-with-ai/accept/route')
    await POST(req({ threadId: 't', proposedCaption: 'c' }), { params })
    expect(acceptFix).toHaveBeenCalledWith({ postId: 'post-1', threadId: 't', proposedCaption: 'c', acceptedBy: 'user-am' })
    await POST(req({ proposedCaption: 'c2' }), { params })
    expect(acceptFixForPost).toHaveBeenCalledWith({ postId: 'post-1', proposedCaption: 'c2', acceptedBy: 'user-am' })
  })
})
