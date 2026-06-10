import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/middleware/auth', () => ({ requireOrgContext: vi.fn() }))
vi.mock('@vercel/blob/client', () => ({ handleUpload: vi.fn() }))

import { POST } from '@/app/api/account/avatar/upload/route'
import { requireOrgContext } from '@/server/middleware/auth'
import { handleUpload } from '@vercel/blob/client'

function req(body: unknown): Request {
  return new Request('http://localhost/api/account/avatar/upload', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireOrgContext).mockResolvedValue({ userId: 'clerk_1', userDbId: 'u_1' } as never)
})

describe('POST /api/account/avatar/upload', () => {
  it('authorizes a pathname under the caller own prefix', async () => {
    let captured: ((pathname: string, payload: unknown) => Promise<unknown>) | null = null
    vi.mocked(handleUpload).mockImplementation((async (opts: {
      onBeforeGenerateToken: (pathname: string, payload: unknown) => Promise<unknown>
    }) => {
      captured = opts.onBeforeGenerateToken
      return { ok: true }
    }) as never)
    const res = await POST(req({ type: 'blob.generate-client-token' }) as never)
    expect(res.status).toBe(200)
    const allowed = await captured!('user-avatars/u_1/170-avatar.webp', null)
    expect(allowed).toMatchObject({ addRandomSuffix: true, maximumSizeInBytes: 5 * 1024 * 1024 })
  })

  it('rejects a pathname under another user prefix', async () => {
    let captured: ((pathname: string, payload: unknown) => Promise<unknown>) | null = null
    vi.mocked(handleUpload).mockImplementation((async (opts: {
      onBeforeGenerateToken: (pathname: string, payload: unknown) => Promise<unknown>
    }) => {
      captured = opts.onBeforeGenerateToken
      return { ok: true }
    }) as never)
    await POST(req({ type: 'blob.generate-client-token' }) as never)
    await expect(captured!('user-avatars/u_999/170-avatar.webp', null)).rejects.toThrow()
  })
})
