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
 *     `findActiveClientSessionForLink` / `findLatestClientSessionForLink` /
 *     `startSession` / `saveDraftItem` —
 *     controls Task 1.4's repo surface. Mocking lets these tests
 *     pass before Task 1.4's PR merges.
 *
 * Test inventory:
 *   1. saves a NEW draft (no prior ReviewSession) — both link lookups
 *      return null → startSession is called to mint one, then saveDraftItem.
 *   2. updates an EXISTING draft against the link's active session —
 *      findActiveClientSessionForLink returns a session, startSession
 *      is NOT called.
 *   3. re-confirm reuses the link's existing session — verifies startSession
 *      is not called when findActiveClientSessionForLink returns a session
 *      (even if the reviewerId in the cookie is different, e.g. a freshly
 *      minted MagicLinkReviewer).
 *   4. forwards undefined decision to saveDraftItem when the route omits it
 *      (comment-only PATCH).
 *   5. throws Unauthorized when verifyToken returns null (bad / expired URL
 *      token) — repo never called.
 *   6. throws PostNotInBatch when postId belongs to a different batch.
 *   7. throws ReviewDraftSessionClosedError when the link's latest session
 *      has status 'submitted' — startSession NOT called.
 *   8. throws ReviewDraftSessionClosedError when the link's latest session
 *      has status 'superseded' — startSession NOT called.
 *   9. calls startSession when both lookups return null (first-ever review,
 *      round-1 creation path).
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
  findActiveClientSessionForLink: vi.fn(),
  findLatestClientSessionForLink: vi.fn(),
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
  findActiveClientSessionForLink: (magicLinkId: string) =>
    mocks.findActiveClientSessionForLink(magicLinkId),
  findLatestClientSessionForLink: (magicLinkId: string) =>
    mocks.findLatestClientSessionForLink(magicLinkId),
  startSession: (input: unknown) => mocks.startSession(input),
  saveDraftItem: (input: unknown) => mocks.saveDraftItem(input),
}))

import {
  saveItemDraft,
  ReviewDraftPostNotInBatchError,
  ReviewDraftSessionClosedError,
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
    addressedAt: null,
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
    // No active session and no latest session — first ever review, mint one.
    mocks.findActiveClientSessionForLink.mockResolvedValue(null)
    mocks.findLatestClientSessionForLink.mockResolvedValue(null)
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

  it('updates an EXISTING draft against the link\'s active session (no startSession call)', async () => {
    primeHappyAuth()
    mocks.findActiveClientSessionForLink.mockResolvedValue({
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

  it('reuses the link\'s existing session when reviewer re-confirms name (no startSession)', async () => {
    primeHappyAuth()
    // Simulate a fresh MagicLinkReviewer minted after re-confirming name —
    // the link already has an in_progress session; the service must reuse it.
    mocks.findActiveClientSessionForLink.mockResolvedValue({
      id: 'rs_existing',
      magicLinkId: LINK_ID,
      reviewerId: 'reviewer_old', // different reviewer than cookie, but link's session
      status: 'in_progress',
      round: 1,
      startedAt: new Date('2026-05-16T09:00:00Z'),
      submittedAt: null,
      submittedSummary: null,
    })
    const item = happyPathHydratedItem({ decision: 'approved' })
    mocks.saveDraftItem.mockResolvedValue(item)

    const result = await saveItemDraft({
      token: VALID_TOKEN,
      postId: POST_ID,
      decision: 'approved',
    })

    expect(result).toEqual(item)
    // Critical: startSession must NOT be called when a link session already exists.
    expect(mocks.startSession).not.toHaveBeenCalled()
    expect(mocks.findLatestClientSessionForLink).not.toHaveBeenCalled()
    expect(mocks.saveDraftItem).toHaveBeenCalledWith(
      expect.objectContaining({ reviewSessionId: 'rs_existing' }),
    )
  })

  // Regression: the PATCH /api/review/[token]/draft route forwards
  // undefined for any field the reviewer did not touch. The service must
  // pass that undefined through to the repo unchanged — coercing it to a
  // concrete value would let the repo's update branch clobber whatever
  // the reviewer set previously. See projects/relay-app/2026-05-17-julio-handoff.md known bug #1.
  it('forwards undefined decision to saveDraftItem when the route omits it (comment-only PATCH)', async () => {
    primeHappyAuth()
    mocks.findActiveClientSessionForLink.mockResolvedValue({
      id: 'rs_existing',
      magicLinkId: LINK_ID,
      reviewerId: REVIEWER_ID,
      status: 'in_progress',
      round: 1,
      startedAt: new Date('2026-05-16T09:00:00Z'),
      submittedAt: null,
      submittedSummary: null,
    })
    mocks.saveDraftItem.mockResolvedValue(
      happyPathHydratedItem({ comment: 'needs more emojis' }),
    )

    await saveItemDraft({
      token: VALID_TOKEN,
      postId: POST_ID,
      comment: 'needs more emojis',
      // decision intentionally omitted — same shape the draft route sends
      // for a textarea blur after an Approve / Changes tap.
    })

    expect(mocks.saveDraftItem).toHaveBeenCalledTimes(1)
    expect(mocks.saveDraftItem).toHaveBeenCalledWith({
      reviewSessionId: 'rs_existing',
      postId: POST_ID,
      decision: undefined,
      comment: 'needs more emojis',
      suggestedCaption: undefined,
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
    expect(mocks.findActiveClientSessionForLink).not.toHaveBeenCalled()
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

    expect(mocks.findActiveClientSessionForLink).not.toHaveBeenCalled()
    expect(mocks.startSession).not.toHaveBeenCalled()
    expect(mocks.saveDraftItem).not.toHaveBeenCalled()
  })

  it('throws ReviewDraftSessionClosedError and does NOT call startSession when latest session is submitted', async () => {
    primeHappyAuth()
    // No active (in_progress) session, but there is a submitted one.
    // The client must not silently create a new round-1.
    mocks.findActiveClientSessionForLink.mockResolvedValue(null)
    mocks.findLatestClientSessionForLink.mockResolvedValue({
      id: 'rs_submitted',
      magicLinkId: LINK_ID,
      reviewerId: REVIEWER_ID,
      status: 'submitted',
      round: 1,
      startedAt: new Date('2026-05-16T09:00:00Z'),
      submittedAt: new Date('2026-05-16T10:00:00Z'),
      submittedSummary: null,
    })

    await expect(
      saveItemDraft({
        token: VALID_TOKEN,
        postId: POST_ID,
        decision: 'approved',
      }),
    ).rejects.toBeInstanceOf(ReviewDraftSessionClosedError)

    expect(mocks.startSession).not.toHaveBeenCalled()
    expect(mocks.saveDraftItem).not.toHaveBeenCalled()
  })

  it('throws ReviewDraftSessionClosedError and does NOT call startSession when latest session is superseded', async () => {
    primeHappyAuth()
    // No active (in_progress) session, and the latest is superseded (AM
    // closed a round and opened a new one on a later reviewer).
    mocks.findActiveClientSessionForLink.mockResolvedValue(null)
    mocks.findLatestClientSessionForLink.mockResolvedValue({
      id: 'rs_superseded',
      magicLinkId: LINK_ID,
      reviewerId: REVIEWER_ID,
      status: 'superseded',
      round: 1,
      startedAt: new Date('2026-05-16T09:00:00Z'),
      submittedAt: null,
      submittedSummary: null,
    })

    await expect(
      saveItemDraft({
        token: VALID_TOKEN,
        postId: POST_ID,
        decision: 'approved',
      }),
    ).rejects.toBeInstanceOf(ReviewDraftSessionClosedError)

    expect(mocks.startSession).not.toHaveBeenCalled()
    expect(mocks.saveDraftItem).not.toHaveBeenCalled()
  })

  it('calls startSession when both findActiveClientSessionForLink and findLatestClientSessionForLink return null', async () => {
    primeHappyAuth()
    // Truly first ever review — no session of any kind exists yet.
    mocks.findActiveClientSessionForLink.mockResolvedValue(null)
    mocks.findLatestClientSessionForLink.mockResolvedValue(null)
    mocks.startSession.mockResolvedValue({
      id: 'rs_brand_new',
      magicLinkId: LINK_ID,
      reviewerId: REVIEWER_ID,
      status: 'in_progress',
      round: 1,
      startedAt: new Date(),
      submittedAt: null,
      submittedSummary: null,
    })
    mocks.saveDraftItem.mockResolvedValue(happyPathHydratedItem())

    await saveItemDraft({
      token: VALID_TOKEN,
      postId: POST_ID,
      decision: 'approved',
    })

    expect(mocks.startSession).toHaveBeenCalledTimes(1)
    expect(mocks.startSession).toHaveBeenCalledWith({
      magicLinkId: LINK_ID,
      reviewerId: REVIEWER_ID,
    })
    expect(mocks.saveDraftItem).toHaveBeenCalledWith(
      expect.objectContaining({ reviewSessionId: 'rs_brand_new' }),
    )
  })
})
