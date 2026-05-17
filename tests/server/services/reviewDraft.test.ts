/**
 * Unit tests for src/server/services/reviewDraft.ts.
 *
 * This is a pure unit test — every external dependency is mocked. We
 * are exercising the auth resolution + post-in-batch validation +
 * session-find-or-create branching logic.
 *
 * What is mocked (and why):
 *   - next/headers `cookies()` — controls whether a magic-link-session
 *     cookie is present + which value it carries.
 *   - @/lib/magic-link `verifyToken` / `verifySession` — controls
 *     whether the URL token and the cookie pass HMAC validation.
 *   - @/server/repositories/magicLinks `findByTokenHash` — controls
 *     the link row (id, batchId, revokedAt, batch.deletedAt).
 *   - @/db/client `db.magicLinkReviewer.findUnique` /
 *     `db.post.findUnique` — controls reviewer + post lookup.
 *   - @/server/repositories/reviewSessions
 *     `findActiveSession` / `startSession` / `saveDraftItem` —
 *     controls Task 1.4's repo surface. Mocking lets these tests
 *     pass before Task 1.4's PR merges.
 *
 * Test inventory (4 cases per Task 1.5 plan):
 *   1. saves a NEW draft (no prior ReviewItem) — verifies the upsert
 *      path goes through `saveDraftItem` with the right inputs.
 *   2. updates an EXISTING draft — saveDraftItem is called the same
 *      way regardless (it owns the upsert branch), so this case
 *      confirms a different decision payload flows through cleanly
 *      against an already-existing session.
 *   3. rejects when the URL token is invalid (verifyToken returns
 *      null) — throws ReviewDraftUnauthorizedError, repo never called.
 *   4. rejects when postId is not in the link's batch — throws
 *      ReviewDraftPostNotInBatchError, repo never called.
 */
process.env.MAGIC_LINK_SECRET = 'test-secret-base64-min-32-bytes-xxxxxxxxxxx'

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  cookiesGet: vi.fn(),
  verifyToken: vi.fn(),
  verifySession: vi.fn(),
  hashToken: vi.fn((t: string) => `hash:${t}`),
  findByTokenHash: vi.fn(),
  findReviewerBySession: vi.fn(),
  findUniqueMagicLinkReviewer: vi.fn(),
  findUniquePost: vi.fn(),
  findActiveSession: vi.fn(),
  startSession: vi.fn(),
  saveDraftItem: vi.fn(),
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
  findReviewerBySession: (sessionId: string) => mocks.findReviewerBySession(sessionId),
}))

vi.mock('@/db/client', () => ({
  db: {
    magicLinkReviewer: {
      findUnique: (args: unknown) => mocks.findUniqueMagicLinkReviewer(args),
    },
    post: {
      findUnique: (args: unknown) => mocks.findUniquePost(args),
    },
  },
}))

vi.mock('@/server/repositories/reviewSessions', () => ({
  findActiveSession: (input: unknown) => mocks.findActiveSession(input),
  startSession: (input: unknown) => mocks.startSession(input),
  saveDraftItem: (input: unknown) => mocks.saveDraftItem(input),
}))

import {
  saveItemDraft,
  ReviewDraftPostNotInBatchError,
  ReviewDraftUnauthorizedError,
} from '@/server/services/reviewDraft'
import type { ReviewItemHydrated } from '@/types/review-session'

const VALID_TOKEN = 'token.payload.sig'
const LINK_ID = 'link_1'
const BATCH_ID = 'batch_1'
const REVIEWER_ID = 'reviewer_1'
const POST_ID = 'post_1'
const SESSION_ID = 'session_1'

function happyPathHydratedItem(
  overrides: Partial<ReviewItemHydrated> = {},
): ReviewItemHydrated {
  return {
    id: 'ri_1',
    postId: POST_ID,
    decision: 'approved',
    comment: null,
    suggestedCaption: null,
    acceptedAsPostVersionId: null,
    updatedSinceLastReview: false,
    lastReviewedVersionId: null,
    reviewedAt: new Date('2026-05-17T10:00:00Z'),
    ...overrides,
  }
}

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
    name: 'Caleb',
    email: null,
    sessionId: SESSION_ID,
    firstSeen: new Date(),
    lastSeen: new Date(),
  })
  mocks.findUniquePost.mockResolvedValue({
    id: POST_ID,
    batchId: BATCH_ID,
  })
}

beforeEach(() => {
  for (const m of Object.values(mocks)) {
    if (typeof m === 'function' && 'mockReset' in m) {
      ;(m as ReturnType<typeof vi.fn>).mockReset()
    }
  }
  // hashToken is a pure passthrough — keep its implementation across resets
  mocks.hashToken.mockImplementation((t: string) => `hash:${t}`)
})

describe('saveItemDraft', () => {
  it('saves a NEW draft when no active session exists yet (startSession path)', async () => {
    primeHappyAuth()
    // No active session — service should call startSession to mint one.
    mocks.findActiveSession.mockResolvedValue(null)
    mocks.startSession.mockResolvedValue({
      id: 'rs_new',
      magicLinkId: LINK_ID,
      reviewerId: REVIEWER_ID,
      status: 'in_progress',
      round: 1,
      startedAt: new Date(),
      submittedAt: null,
      submittedSummary: null,
    })
    const created = happyPathHydratedItem({ decision: 'approved' })
    mocks.saveDraftItem.mockResolvedValue(created)

    const result = await saveItemDraft({
      token: VALID_TOKEN,
      postId: POST_ID,
      decision: 'approved',
      comment: 'looks great',
    })

    expect(result).toEqual(created)

    expect(mocks.startSession).toHaveBeenCalledTimes(1)
    expect(mocks.startSession).toHaveBeenCalledWith({
      magicLinkId: LINK_ID,
      reviewerId: REVIEWER_ID,
    })

    expect(mocks.saveDraftItem).toHaveBeenCalledTimes(1)
    expect(mocks.saveDraftItem).toHaveBeenCalledWith({
      reviewSessionId: 'rs_new',
      postId: POST_ID,
      decision: 'approved',
      comment: 'looks great',
      suggestedCaption: undefined,
    })
  })

  it('updates an EXISTING draft against the active session (no startSession call)', async () => {
    primeHappyAuth()
    mocks.findActiveSession.mockResolvedValue({
      id: 'rs_existing',
      magicLinkId: LINK_ID,
      reviewerId: REVIEWER_ID,
      status: 'in_progress',
      round: 1,
      startedAt: new Date('2026-05-16T09:00:00Z'),
      submittedAt: null,
      submittedSummary: null,
    })
    const updated = happyPathHydratedItem({
      decision: 'caption_edited',
      suggestedCaption: 'Welcome to our outdoor seating area. Sundays just got better.',
    })
    mocks.saveDraftItem.mockResolvedValue(updated)

    const result = await saveItemDraft({
      token: VALID_TOKEN,
      postId: POST_ID,
      decision: 'caption_edited',
      suggestedCaption:
        'Welcome to our outdoor seating area. Sundays just got better.',
    })

    expect(result).toEqual(updated)
    // The existing-session path must NOT mint a new session.
    expect(mocks.startSession).not.toHaveBeenCalled()
    expect(mocks.saveDraftItem).toHaveBeenCalledTimes(1)
    expect(mocks.saveDraftItem).toHaveBeenCalledWith({
      reviewSessionId: 'rs_existing',
      postId: POST_ID,
      decision: 'caption_edited',
      comment: undefined,
      suggestedCaption:
        'Welcome to our outdoor seating area. Sundays just got better.',
    })
  })

  it('throws Unauthorized when verifyToken returns null (bad / expired URL token)', async () => {
    // Prime everything but the token verifier so we can prove the early
    // return short-circuits before any DB lookup happens.
    mocks.verifyToken.mockReturnValue(null)
    mocks.findByTokenHash.mockResolvedValue({
      id: LINK_ID,
      batchId: BATCH_ID,
      revokedAt: null,
      batch: { id: BATCH_ID, deletedAt: null },
    })
    mocks.cookiesGet.mockReturnValue({ value: 'cookie-value' })

    await expect(
      saveItemDraft({
        token: 'bogus.token.value',
        postId: POST_ID,
        decision: 'approved',
      }),
    ).rejects.toBeInstanceOf(ReviewDraftUnauthorizedError)

    expect(mocks.findByTokenHash).not.toHaveBeenCalled()
    expect(mocks.findActiveSession).not.toHaveBeenCalled()
    expect(mocks.saveDraftItem).not.toHaveBeenCalled()
  })

  it('throws PostNotInBatch when postId belongs to a different batch', async () => {
    primeHappyAuth()
    // Post exists but is wired to a foreign batch — defense in depth
    // catches a reviewer trying to draft on a post outside their link.
    mocks.findUniquePost.mockResolvedValue({
      id: POST_ID,
      batchId: 'batch_OTHER',
    })

    await expect(
      saveItemDraft({
        token: VALID_TOKEN,
        postId: POST_ID,
        decision: 'approved',
      }),
    ).rejects.toBeInstanceOf(ReviewDraftPostNotInBatchError)

    expect(mocks.findActiveSession).not.toHaveBeenCalled()
    expect(mocks.startSession).not.toHaveBeenCalled()
    expect(mocks.saveDraftItem).not.toHaveBeenCalled()
  })
})
