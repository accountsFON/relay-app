/**
 * Adversarial tests for POST /api/review/[token]/comment-image/upload
 *
 * Security contracts verified:
 *  1. No cookie  → 401, handleUpload never called
 *  2. Cookie valid but URL token hash mismatch → 403, handleUpload never called
 *  3. Cookie valid + token matches → handleUpload called;
 *     onBeforeGenerateToken enforces per-reviewer blob prefix + content/size caps
 *  4. Invalid JSON body → 400
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- module mocks (hoisted before any imports) ---
vi.mock('@/server/auth/magic-link-reviewer', () => ({
  getMagicLinkReviewerFromCookie: vi.fn(),
}))
vi.mock('@/lib/magic-link', () => ({
  hashToken: vi.fn(),
}))
vi.mock('@vercel/blob/client', () => ({
  handleUpload: vi.fn(),
}))

import { POST } from '@/app/api/review/[token]/comment-image/upload/route'
import { getMagicLinkReviewerFromCookie } from '@/server/auth/magic-link-reviewer'
import { hashToken } from '@/lib/magic-link'
import { handleUpload } from '@vercel/blob/client'
import { COMMENT_IMAGE_PREFIX } from '@/lib/comment-image'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOKEN = 'abc123magictoken'
const TOKEN_HASH = 'deadbeef1234hash'

/** Build the NextRequest + params Promise that the route expects (Next 16 shape) */
function makeReq(body: unknown): Request {
  return new Request(`http://localhost/api/review/${TOKEN}/comment-image/upload`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

function makeParams(): { params: Promise<{ token: string }> } {
  return { params: Promise.resolve({ token: TOKEN }) }
}

const REVIEWER = {
  reviewerId: 'reviewer_1',
  name: 'Alice',
  magicLinkId: 'link_1',
  batchId: 'batch_1',
  tokenHash: TOKEN_HASH,
}

// ownPrefix that the route must enforce
const OWN_PREFIX = `${COMMENT_IMAGE_PREFIX}/review/${TOKEN_HASH}/`

// ---------------------------------------------------------------------------
// beforeEach: clear + set safe defaults
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks()

  // default: cookie matches, token hash matches
  vi.mocked(getMagicLinkReviewerFromCookie).mockResolvedValue(REVIEWER)
  vi.mocked(hashToken).mockReturnValue(TOKEN_HASH)
  vi.mocked(handleUpload).mockResolvedValue({ ok: true } as never)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/review/[token]/comment-image/upload', () => {
  // -------------------------------------------------------------------------
  // Auth: no cookie
  // -------------------------------------------------------------------------
  it('returns 401 and does not call handleUpload when there is no cookie (getMagicLinkReviewerFromCookie returns null)', async () => {
    vi.mocked(getMagicLinkReviewerFromCookie).mockResolvedValue(null)

    const res = await POST(makeReq({ type: 'blob.generate-client-token' }) as never, makeParams())

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'Unauthorized' })
    expect(handleUpload).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Auth: cookie valid but URL token does not belong to this link
  // -------------------------------------------------------------------------
  it('returns 403 and does not call handleUpload when cookie tokenHash does not match hashToken(urlToken)', async () => {
    // The cookie belongs to a different link whose hash does not match TOKEN
    vi.mocked(hashToken).mockReturnValue('completely_different_hash')

    const res = await POST(makeReq({ type: 'blob.generate-client-token' }) as never, makeParams())

    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'Forbidden' })
    expect(handleUpload).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Happy path: valid cookie + matching token
  // -------------------------------------------------------------------------
  it('calls handleUpload and returns its JSON when cookie and token are both valid', async () => {
    const res = await POST(makeReq({ type: 'blob.generate-client-token' }) as never, makeParams())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(handleUpload).toHaveBeenCalledOnce()
  })

  // -------------------------------------------------------------------------
  // onBeforeGenerateToken: valid pathname (under reviewer's own prefix)
  // -------------------------------------------------------------------------
  it('onBeforeGenerateToken returns allowedContentTypes and 5 MB cap for a valid pathname under the reviewer prefix', async () => {
    let capturedCb: ((pathname: string) => Promise<unknown>) | null = null

    vi.mocked(handleUpload).mockImplementation((async (opts: {
      onBeforeGenerateToken: (pathname: string) => Promise<unknown>
    }) => {
      capturedCb = opts.onBeforeGenerateToken
      return { ok: true }
    }) as never)

    const res = await POST(makeReq({ type: 'blob.generate-client-token' }) as never, makeParams())
    expect(res.status).toBe(200)

    // A valid pathname under the reviewer's own prefix
    const validPathname = `${OWN_PREFIX}1234-photo.png`
    const result = await capturedCb!(validPathname)

    expect(result).toMatchObject({
      allowedContentTypes: expect.arrayContaining(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
      maximumSizeInBytes: 5 * 1024 * 1024,
      addRandomSuffix: true,
    })
  })

  // -------------------------------------------------------------------------
  // onBeforeGenerateToken: pathname outside reviewer prefix (path-traversal / wrong reviewer)
  // -------------------------------------------------------------------------
  it('onBeforeGenerateToken THROWS when pathname is outside the reviewer blob prefix', async () => {
    let capturedCb: ((pathname: string) => Promise<unknown>) | null = null

    vi.mocked(handleUpload).mockImplementation((async (opts: {
      onBeforeGenerateToken: (pathname: string) => Promise<unknown>
    }) => {
      capturedCb = opts.onBeforeGenerateToken
      return { ok: true }
    }) as never)

    await POST(makeReq({ type: 'blob.generate-client-token' }) as never, makeParams())

    // Attacker tries to write under a different reviewer's prefix
    await expect(
      capturedCb!(`${COMMENT_IMAGE_PREFIX}/review/other_reviewer_hash/evil.png`),
    ).rejects.toThrow('Forbidden: pathname outside reviewer comment-image prefix')
  })

  it('onBeforeGenerateToken THROWS when pathname tries to escape into am/ (wrong branch)', async () => {
    let capturedCb: ((pathname: string) => Promise<unknown>) | null = null

    vi.mocked(handleUpload).mockImplementation((async (opts: {
      onBeforeGenerateToken: (pathname: string) => Promise<unknown>
    }) => {
      capturedCb = opts.onBeforeGenerateToken
      return { ok: true }
    }) as never)

    await POST(makeReq({ type: 'blob.generate-client-token' }) as never, makeParams())

    // Attacker tries to write under the am/ (agency member) branch
    await expect(
      capturedCb!(`${COMMENT_IMAGE_PREFIX}/am/u_999/evil.png`),
    ).rejects.toThrow('Forbidden: pathname outside reviewer comment-image prefix')
  })

  it('onBeforeGenerateToken THROWS for an arbitrary path with no prefix at all', async () => {
    let capturedCb: ((pathname: string) => Promise<unknown>) | null = null

    vi.mocked(handleUpload).mockImplementation((async (opts: {
      onBeforeGenerateToken: (pathname: string) => Promise<unknown>
    }) => {
      capturedCb = opts.onBeforeGenerateToken
      return { ok: true }
    }) as never)

    await POST(makeReq({ type: 'blob.generate-client-token' }) as never, makeParams())

    await expect(capturedCb!('arbitrary/path/file.png')).rejects.toThrow()
  })

  // -------------------------------------------------------------------------
  // Invalid JSON body
  // -------------------------------------------------------------------------
  it('returns 400 for an invalid JSON body', async () => {
    const badReq = new Request(`http://localhost/api/review/${TOKEN}/comment-image/upload`, {
      method: 'POST',
      body: 'not-json{{{',
      headers: { 'content-type': 'application/json' },
    })

    const res = await POST(badReq as never, makeParams())

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'Invalid JSON body' })
    expect(handleUpload).not.toHaveBeenCalled()
  })
})
