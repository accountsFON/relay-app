import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/middleware/auth', () => ({ requireOrgContext: vi.fn() }))
vi.mock('@vercel/blob/client', () => ({ handleUpload: vi.fn() }))

import { POST } from '@/app/api/feedback/image/upload/route'
import { requireOrgContext } from '@/server/middleware/auth'
import { handleUpload } from '@vercel/blob/client'

function req(body: unknown): Request {
  return new Request('http://localhost/api/feedback/image/upload', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireOrgContext).mockResolvedValue({
    userId: 'clerk_1',
    userDbId: 'u_1',
  } as never)
})

describe('POST /api/feedback/image/upload', () => {
  it('calls handleUpload and returns its JSON for a valid request', async () => {
    vi.mocked(handleUpload).mockImplementation((async () => ({ ok: true })) as never)
    const res = await POST(req({ type: 'blob.generate-client-token' }) as never)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(handleUpload).toHaveBeenCalledOnce()
  })

  it('onBeforeGenerateToken returns the 5 MB image token options for a feedback-images path', async () => {
    let captured:
      | ((pathname: string, payload: unknown) => Promise<unknown>)
      | null = null
    vi.mocked(handleUpload).mockImplementation((async (opts: {
      onBeforeGenerateToken: (p: string, payload: unknown) => Promise<unknown>
    }) => {
      captured = opts.onBeforeGenerateToken
      return { ok: true }
    }) as never)

    await POST(req({ type: 'blob.generate-client-token' }) as never)
    const result = await captured!('feedback-images/1234-shot.png', null)
    expect(result).toMatchObject({
      addRandomSuffix: true,
      maximumSizeInBytes: 5 * 1024 * 1024,
      allowedContentTypes: expect.arrayContaining([
        'image/png',
        'image/jpeg',
        'image/webp',
        'image/gif',
      ]),
    })
  })

  it('onBeforeGenerateToken throws for a pathname outside feedback-images/', async () => {
    let captured:
      | ((pathname: string, payload: unknown) => Promise<unknown>)
      | null = null
    vi.mocked(handleUpload).mockImplementation((async (opts: {
      onBeforeGenerateToken: (p: string, payload: unknown) => Promise<unknown>
    }) => {
      captured = opts.onBeforeGenerateToken
      return { ok: true }
    }) as never)

    await POST(req({ type: 'blob.generate-client-token' }) as never)
    await expect(
      captured!('comment-images/am/u_1/evil.png', null),
    ).rejects.toThrow('Forbidden: pathname outside feedback-images prefix')
  })

  it('returns 400 for an invalid JSON body', async () => {
    const badReq = new Request('http://localhost/api/feedback/image/upload', {
      method: 'POST',
      body: 'not-json',
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(badReq as never)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'Invalid JSON body' })
  })

  it('rejects (does not call handleUpload) when requireOrgContext throws', async () => {
    vi.mocked(requireOrgContext).mockRejectedValue(new Error('Unauthorized'))
    await expect(
      POST(req({ type: 'blob.generate-client-token' }) as never),
    ).rejects.toThrow('Unauthorized')
    expect(handleUpload).not.toHaveBeenCalled()
  })
})
