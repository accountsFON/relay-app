import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/middleware/auth', () => ({ requireOrgContext: vi.fn() }))
vi.mock('@vercel/blob/client', () => ({ handleUpload: vi.fn() }))

import { POST } from '@/app/api/comment-image/upload/route'
import { requireOrgContext } from '@/server/middleware/auth'
import { handleUpload } from '@vercel/blob/client'

function req(body: unknown): Request {
  return new Request('http://localhost/api/comment-image/upload', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireOrgContext).mockResolvedValue({ userId: 'clerk_1', userDbId: 'u_1' } as never)
})

describe('POST /api/comment-image/upload', () => {
  it('calls handleUpload and returns its JSON for a valid request', async () => {
    vi.mocked(handleUpload).mockImplementation((async () => {
      return { ok: true }
    }) as never)
    const res = await POST(req({ type: 'blob.generate-client-token' }) as never)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(handleUpload).toHaveBeenCalledOnce()
  })

  it('onBeforeGenerateToken returns allowedContentTypes (incl. gif) + 5 MB cap for a valid pathname', async () => {
    let captured: ((pathname: string, payload: unknown) => Promise<unknown>) | null = null
    vi.mocked(handleUpload).mockImplementation((async (opts: {
      onBeforeGenerateToken: (pathname: string, payload: unknown) => Promise<unknown>
    }) => {
      captured = opts.onBeforeGenerateToken
      return { ok: true }
    }) as never)

    const res = await POST(req({ type: 'blob.generate-client-token' }) as never)
    expect(res.status).toBe(200)

    const result = await captured!('comment-images/am/u_1/1234-photo.png', null)
    expect(result).toMatchObject({
      addRandomSuffix: true,
      maximumSizeInBytes: 5 * 1024 * 1024,
      allowedContentTypes: expect.arrayContaining(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
    })
  })

  it('onBeforeGenerateToken throws when pathname is outside the caller prefix', async () => {
    let captured: ((pathname: string, payload: unknown) => Promise<unknown>) | null = null
    vi.mocked(handleUpload).mockImplementation((async (opts: {
      onBeforeGenerateToken: (pathname: string, payload: unknown) => Promise<unknown>
    }) => {
      captured = opts.onBeforeGenerateToken
      return { ok: true }
    }) as never)

    await POST(req({ type: 'blob.generate-client-token' }) as never)
    await expect(captured!('comment-images/am/u_999/evil.png', null)).rejects.toThrow(
      'Forbidden: pathname outside caller comment-image prefix',
    )
  })

  it('onBeforeGenerateToken throws when pathname is under review/ (wrong branch)', async () => {
    let captured: ((pathname: string, payload: unknown) => Promise<unknown>) | null = null
    vi.mocked(handleUpload).mockImplementation((async (opts: {
      onBeforeGenerateToken: (pathname: string, payload: unknown) => Promise<unknown>
    }) => {
      captured = opts.onBeforeGenerateToken
      return { ok: true }
    }) as never)

    await POST(req({ type: 'blob.generate-client-token' }) as never)
    await expect(captured!('comment-images/review/token123/photo.png', null)).rejects.toThrow()
  })

  it('returns 400 for an invalid JSON body', async () => {
    const badReq = new Request('http://localhost/api/comment-image/upload', {
      method: 'POST',
      body: 'not-json',
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(badReq as never)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'Invalid JSON body' })
  })

  it('returns 400 (does not call handleUpload) when requireOrgContext rejects', async () => {
    vi.mocked(requireOrgContext).mockRejectedValue(new Error('Unauthorized'))
    vi.mocked(handleUpload).mockResolvedValue({ ok: true } as never)
    await expect(POST(req({ type: 'blob.generate-client-token' }) as never)).rejects.toThrow(
      'Unauthorized',
    )
    expect(handleUpload).not.toHaveBeenCalled()
  })
})
