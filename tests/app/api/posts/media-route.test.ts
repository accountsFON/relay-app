// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { findPostById } = vi.hoisted(() => ({ findPostById: vi.fn() }))
const { requirePostMediaEditor } = vi.hoisted(() => ({ requirePostMediaEditor: vi.fn() }))
const { attachMediaToPost } = vi.hoisted(() => ({ attachMediaToPost: vi.fn() }))
const { assertBatchEditable } = vi.hoisted(() => ({ assertBatchEditable: vi.fn() }))

vi.mock('@/server/repositories/posts', () => ({ findPostById }))
vi.mock('@/server/middleware/permissions', () => ({ requirePostMediaEditor }))
vi.mock('@/lib/media', () => ({ attachMediaToPost }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/server/lib/relay-lock-guard', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/server/lib/relay-lock-guard')>()
  return { ...orig, assertBatchEditable }
})

import { RelayCompletedError } from '@/server/lib/relay-lock-guard'

function req(body: unknown) {
  return new Request('http://t/api/posts/p1/media', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest
}

const params = Promise.resolve({ id: 'p1' })

const STUB_POST = {
  id: 'p1',
  batchId: 'b1',
  clientId: 'client_1',
}

describe('POST /api/posts/[id]/media', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requirePostMediaEditor.mockResolvedValue({ userDbId: 'user_am' })
    findPostById.mockResolvedValue(STUB_POST)
    attachMediaToPost.mockResolvedValue({ id: 'p1', mediaUrls: ['https://x/y.png'] })
    assertBatchEditable.mockResolvedValue(undefined)
  })

  it('returns 409 and does NOT call attachMediaToPost when relay is completed', async () => {
    assertBatchEditable.mockRejectedValueOnce(new RelayCompletedError())

    const { POST } = await import('@/app/api/posts/[id]/media/route')
    const res = await POST(req({ url: 'https://x/y.png' }), { params })

    expect(res.status).toBe(409)
    expect(attachMediaToPost).not.toHaveBeenCalled()
  })

  it('returns 200 and calls attachMediaToPost when relay is editable', async () => {
    const { POST } = await import('@/app/api/posts/[id]/media/route')
    const res = await POST(req({ url: 'https://x/y.png' }), { params })

    expect(res.status).toBe(200)
    expect(attachMediaToPost).toHaveBeenCalledWith({ postId: 'p1', url: 'https://x/y.png' })
  })

  it('returns 404 when post is not found', async () => {
    findPostById.mockResolvedValue(null)

    const { POST } = await import('@/app/api/posts/[id]/media/route')
    const res = await POST(req({ url: 'https://x/y.png' }), { params })

    expect(res.status).toBe(404)
    expect(attachMediaToPost).not.toHaveBeenCalled()
  })
})
