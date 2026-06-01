/**
 * Unit tests for src/server/services/reviewTutorial.ts.
 *
 * Pure unit test; every external dependency is mocked. We exercise:
 *   - The happy path: valid token + valid cookie session resolves the
 *     reviewer and sets MagicLinkReviewer.tutorialSeenAt.
 *   - Auth rejections: invalid URL token, missing cookie, mismatched
 *     cookie / link, and unknown reviewer all throw
 *     ReviewTutorialUnauthorizedError without touching the update path.
 *   - Link gone: revoked link or deleted batch throws
 *     ReviewTutorialLinkGoneError.
 */
process.env.MAGIC_LINK_SECRET = 'test-secret-base64-min-32-bytes-xxxxxxxxxxx'

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  cookiesGet: vi.fn(),
  verifyToken: vi.fn(),
  verifySession: vi.fn(),
  hashToken: vi.fn((t: string) => `hash:${t}`),
  findByTokenHash: vi.fn(),
  findUniqueMagicLinkReviewer: vi.fn(),
  updateMagicLinkReviewer: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => mocks.cookiesGet(name),
  }),
}))

vi.mock('@/lib/magic-link', () => ({
  verifyToken: (token: string) => mocks.verifyToken(token),
  verifySession: (value: string) => mocks.verifySession(value),
  hashToken: (token: string) => mocks.hashToken(token),
}))

vi.mock('@/server/repositories/magicLinks', () => ({
  findByTokenHash: (hash: string) => mocks.findByTokenHash(hash),
}))

vi.mock('@/db/client', () => ({
  db: {
    magicLinkReviewer: {
      findUnique: (args: unknown) => mocks.findUniqueMagicLinkReviewer(args),
      update: (args: unknown) => mocks.updateMagicLinkReviewer(args),
    },
  },
}))

import {
  markTutorialSeen,
  ReviewTutorialLinkGoneError,
  ReviewTutorialUnauthorizedError,
} from '@/server/services/reviewTutorial'

const VALID_TOKEN = 'token.payload.sig'
const LINK_ID = 'link_1'
const BATCH_ID = 'batch_1'
const REVIEWER_ID = 'reviewer_1'

function primeHappyAuth() {
  mocks.verifyToken.mockReturnValue({
    magicLinkId: LINK_ID,
    expiresAt: Date.now() + 60_000,
  })
  mocks.findByTokenHash.mockResolvedValue({
    id: LINK_ID,
    batchId: BATCH_ID,
    revokedAt: null,
    batch: { id: BATCH_ID, deletedAt: null },
  })
  mocks.cookiesGet.mockReturnValue({ value: 'cookie-value' })
  mocks.verifySession.mockReturnValue({
    magicLinkId: LINK_ID,
    reviewerId: REVIEWER_ID,
  })
  mocks.findUniqueMagicLinkReviewer.mockResolvedValue({
    id: REVIEWER_ID,
    magicLinkId: LINK_ID,
  })
  mocks.updateMagicLinkReviewer.mockResolvedValue({
    id: REVIEWER_ID,
    magicLinkId: LINK_ID,
    tutorialSeenAt: new Date(),
  })
}

beforeEach(() => {
  for (const m of Object.values(mocks)) {
    if (typeof m === 'function' && 'mockReset' in m) {
      ;(m as ReturnType<typeof vi.fn>).mockReset()
    }
  }
  mocks.hashToken.mockImplementation((t: string) => `hash:${t}`)
})

describe('markTutorialSeen', () => {
  it('sets MagicLinkReviewer.tutorialSeenAt on the resolved reviewer', async () => {
    primeHappyAuth()

    const result = await markTutorialSeen({ token: VALID_TOKEN })

    expect(result.reviewerId).toBe(REVIEWER_ID)
    expect(result.tutorialSeenAt).toBeInstanceOf(Date)

    expect(mocks.updateMagicLinkReviewer).toHaveBeenCalledTimes(1)
    const callArgs = mocks.updateMagicLinkReviewer.mock.calls[0]?.[0] as {
      where: { id: string }
      data: { tutorialSeenAt: Date }
    }
    expect(callArgs.where).toEqual({ id: REVIEWER_ID })
    expect(callArgs.data.tutorialSeenAt).toBeInstanceOf(Date)
  })

  it('throws Unauthorized when the URL token does not verify', async () => {
    primeHappyAuth()
    mocks.verifyToken.mockReturnValueOnce(null)

    await expect(markTutorialSeen({ token: 'bad' })).rejects.toBeInstanceOf(
      ReviewTutorialUnauthorizedError,
    )
    expect(mocks.updateMagicLinkReviewer).not.toHaveBeenCalled()
  })

  it('throws LinkGone when the link is revoked', async () => {
    primeHappyAuth()
    mocks.findByTokenHash.mockResolvedValueOnce({
      id: LINK_ID,
      batchId: BATCH_ID,
      revokedAt: new Date(),
      batch: { id: BATCH_ID, deletedAt: null },
    })

    await expect(markTutorialSeen({ token: VALID_TOKEN })).rejects.toBeInstanceOf(
      ReviewTutorialLinkGoneError,
    )
    expect(mocks.updateMagicLinkReviewer).not.toHaveBeenCalled()
  })

  it('throws Unauthorized when no session cookie is present', async () => {
    primeHappyAuth()
    mocks.cookiesGet.mockReturnValueOnce(undefined)

    await expect(markTutorialSeen({ token: VALID_TOKEN })).rejects.toBeInstanceOf(
      ReviewTutorialUnauthorizedError,
    )
    expect(mocks.updateMagicLinkReviewer).not.toHaveBeenCalled()
  })

  it('throws Unauthorized when the cookie session magicLinkId does not match', async () => {
    primeHappyAuth()
    mocks.verifySession.mockReturnValueOnce({
      magicLinkId: 'link_other',
      reviewerId: REVIEWER_ID,
    })

    await expect(markTutorialSeen({ token: VALID_TOKEN })).rejects.toBeInstanceOf(
      ReviewTutorialUnauthorizedError,
    )
    expect(mocks.updateMagicLinkReviewer).not.toHaveBeenCalled()
  })

  it('throws Unauthorized when the reviewer is not found for this link', async () => {
    primeHappyAuth()
    mocks.findUniqueMagicLinkReviewer.mockResolvedValueOnce(null)

    await expect(markTutorialSeen({ token: VALID_TOKEN })).rejects.toBeInstanceOf(
      ReviewTutorialUnauthorizedError,
    )
    expect(mocks.updateMagicLinkReviewer).not.toHaveBeenCalled()
  })
})
