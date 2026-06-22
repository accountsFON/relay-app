// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mocks (must be declared before imports) ---

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) }),
}))

vi.mock('@/lib/magic-link', () => ({
  verifySession: vi.fn(),
}))

vi.mock('@/db/client', () => ({
  db: {
    magicLinkReviewer: { findUnique: vi.fn() },
  },
}))

// --- Imports after mocks ---

import { cookies } from 'next/headers'
import { verifySession } from '@/lib/magic-link'
import { db } from '@/db/client'
import {
  getMagicLinkReviewerFromCookie,
  MAGIC_LINK_SESSION_COOKIE,
} from '@/server/auth/magic-link-reviewer'

// --- Fixtures ---

const SESSION = { reviewerId: 'reviewer_1', magicLinkId: 'link_1' }

const REVIEWER_ROW = {
  id: 'reviewer_1',
  name: 'Jane Reviewer',
  magicLinkId: 'link_1',
  magicLink: {
    id: 'link_1',
    tokenHash: 'hash_abc',
    revokedAt: null,
  },
}

function mockCookieWithValue(value: string | undefined) {
  vi.mocked(cookies).mockResolvedValue({
    get: vi.fn().mockReturnValue(value ? { value } : undefined),
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: no cookie
  vi.mocked(cookies).mockResolvedValue({
    get: vi.fn().mockReturnValue(undefined),
  } as never)
})

describe('getMagicLinkReviewerFromCookie', () => {
  it('returns null when the cookie is absent — db is never called', async () => {
    // Default beforeEach already sets up no cookie
    const result = await getMagicLinkReviewerFromCookie()

    expect(result).toBeNull()
    expect(db.magicLinkReviewer.findUnique).not.toHaveBeenCalled()
  })

  it('returns null when verifySession returns null (invalid / expired signature)', async () => {
    mockCookieWithValue('bad-cookie-value')
    vi.mocked(verifySession).mockReturnValue(null)

    const result = await getMagicLinkReviewerFromCookie()

    expect(result).toBeNull()
    expect(db.magicLinkReviewer.findUnique).not.toHaveBeenCalled()
  })

  it('returns null when the reviewer row is not found in the db', async () => {
    mockCookieWithValue('valid-cookie')
    vi.mocked(verifySession).mockReturnValue(SESSION)
    vi.mocked(db.magicLinkReviewer.findUnique).mockResolvedValue(null)

    const result = await getMagicLinkReviewerFromCookie()

    expect(result).toBeNull()
  })

  it('returns null when reviewer.magicLinkId does not match session.magicLinkId', async () => {
    mockCookieWithValue('valid-cookie')
    vi.mocked(verifySession).mockReturnValue(SESSION)
    vi.mocked(db.magicLinkReviewer.findUnique).mockResolvedValue({
      ...REVIEWER_ROW,
      magicLinkId: 'DIFFERENT_LINK_ID',
    } as never)

    const result = await getMagicLinkReviewerFromCookie()

    expect(result).toBeNull()
  })

  it('returns null when the magic link has been revoked', async () => {
    mockCookieWithValue('valid-cookie')
    vi.mocked(verifySession).mockReturnValue(SESSION)
    vi.mocked(db.magicLinkReviewer.findUnique).mockResolvedValue({
      ...REVIEWER_ROW,
      magicLink: {
        ...REVIEWER_ROW.magicLink,
        revokedAt: new Date('2026-06-01T00:00:00Z'),
      },
    } as never)

    const result = await getMagicLinkReviewerFromCookie()

    expect(result).toBeNull()
  })

  it('returns the full reviewer context when all checks pass', async () => {
    mockCookieWithValue('valid-cookie')
    vi.mocked(verifySession).mockReturnValue(SESSION)
    vi.mocked(db.magicLinkReviewer.findUnique).mockResolvedValue(REVIEWER_ROW as never)

    const result = await getMagicLinkReviewerFromCookie()

    expect(result).toEqual({
      reviewerId: 'reviewer_1',
      name: 'Jane Reviewer',
      magicLinkId: 'link_1',
      tokenHash: 'hash_abc',
    })

    // Confirm the db was queried with the correct reviewer id from the session
    expect(db.magicLinkReviewer.findUnique).toHaveBeenCalledWith({
      where: { id: SESSION.reviewerId },
      select: {
        id: true,
        name: true,
        magicLinkId: true,
        magicLink: { select: { id: true, tokenHash: true, revokedAt: true } },
      },
    })
  })

  it('exports MAGIC_LINK_SESSION_COOKIE constant with the correct value', () => {
    expect(MAGIC_LINK_SESSION_COOKIE).toBe('magic-link-session')
  })
})
