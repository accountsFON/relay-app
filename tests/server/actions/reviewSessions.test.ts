// @vitest-environment node
/**
 * Unit tests for submitSessionAction.
 *
 * Three cases:
 *   1. Happy path , flips status, sends digest with the right props, emits
 *      review_session_submitted, returns the summary.
 *   2. Empty session , no items , throws and does NOT call submitSession
 *      / sendEmail / recordActivity.
 *   3. Email failure , submission still succeeds, status was flipped, the
 *      result carries `emailError`.
 *
 * The reviewer-side resolveReviewerForToken path (cookie + token verify +
 * magic-link lookup) is exercised end-to-end here too , the alternative
 * (mocking it directly) would require exporting an internal that 'use
 * server' modules are not allowed to expose.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))


vi.mock('@/lib/magic-link', () => ({
  verifyToken: vi.fn(),
  verifySession: vi.fn(),
  hashToken: vi.fn(() => 'hashed-token'),
  signToken: vi.fn(() => 'reminted-token-abc'),
}))

vi.mock('@/server/repositories/magicLinks', () => ({
  findByTokenHash: vi.fn(),
}))

vi.mock('@/server/repositories/reviewSessions', () => ({
  findActiveSession: vi.fn(),
  findActiveClientSessionForLink: vi.fn(),
  findLatestClientSessionForLink: vi.fn(),
  findSessionWithItems: vi.fn(),
  saveDraftItem: vi.fn(),
  startSession: vi.fn(),
  submitSession: vi.fn(),
}))

vi.mock('@/server/services/reviewRound', () => ({
  startNextRound: vi.fn(),
}))

vi.mock('@/server/services/postVersions', () => ({
  snapshotPostVersion: vi.fn(),
}))

vi.mock('@/server/services/sendMagicLinkEmail', () => ({
  sendMagicLinkEmail: vi.fn(),
}))

vi.mock('@/server/repositories/organizations', () => ({
  getOrgBranding: vi.fn().mockResolvedValue({
    name: 'Five One Nine Marketing',
    brandLogoUrl: null,
    brandColor: null,
  }),
}))

vi.mock('@/server/middleware/permissions', () => ({
  requireClientEditor: vi.fn(),
}))

vi.mock('@/server/repositories/clients', () => ({
  findClientForUser: vi.fn(),
}))

vi.mock('@/server/services/activity', async () => {
  const actual = await vi.importActual<typeof import('@prisma/client')>('@prisma/client')
  return {
    recordActivity: vi.fn(),
    ActivityKind: actual.ActivityKind,
    EventVisibility: actual.EventVisibility,
  }
})

vi.mock('@/server/services/relay', () => ({
  advanceFromClientReview: vi.fn(),
}))

vi.mock('@/lib/resend', () => ({
  sendEmail: vi.fn(),
}))

vi.mock('@/server/repositories/threads', () => ({
  bulkResolveOnPost: vi.fn().mockResolvedValue(0),
  bulkReopenOnPost: vi.fn().mockResolvedValue(0),
}))

vi.mock('@/db/client', () => ({
  db: {
    magicLinkReviewer: { findUnique: vi.fn() },
    magicLink: { findUnique: vi.fn() },
    batch: { findUnique: vi.fn() },
    post: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    postThread: { findMany: vi.fn() },
    reviewItem: { findUnique: vi.fn(), update: vi.fn() },
    activityEvent: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/server/lib/relay-lock-guard', async (orig) => {
  const actual = await orig<typeof import('@/server/lib/relay-lock-guard')>()
  return { ...actual, assertBatchEditable: vi.fn() }
})

import { cookies } from 'next/headers'
import { verifyToken, verifySession } from '@/lib/magic-link'
import { findByTokenHash } from '@/server/repositories/magicLinks'
import {
  findActiveClientSessionForLink,
  findLatestClientSessionForLink,
  findSessionWithItems,
  startSession,
  submitSession,
} from '@/server/repositories/reviewSessions'
import { recordActivity, ActivityKind } from '@/server/services/activity'
import { sendEmail } from '@/lib/resend'
import { db } from '@/db/client'
import { startNextRound } from '@/server/services/reviewRound'
import { snapshotPostVersion } from '@/server/services/postVersions'
import { sendMagicLinkEmail } from '@/server/services/sendMagicLinkEmail'
import { requireClientEditor } from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import { getOrgBranding } from '@/server/repositories/organizations'
import { advanceFromClientReview } from '@/server/services/relay'
import { bulkResolveOnPost, bulkReopenOnPost } from '@/server/repositories/threads'
import {
  acceptCaptionEditAction,
  addressItemAction,
  markPostAddressedAction,
  rejectCaptionEditAction,
  resolveNoteAction,
  saveReviewDraftAction,
  startNextRoundAction,
  startReviewSessionAction,
  submitSessionAction,
  unmarkPostAddressedAction,
  unresolveNoteAction,
} from '@/server/actions/reviewSessions'
import { assertBatchEditable, RelayCompletedError } from '@/server/lib/relay-lock-guard'

const TOKEN = 'raw-token-abc'
const MAGIC_LINK_ID = 'cuid_link_1'
const REVIEWER_ID = 'cuid_reviewer_1'
const BATCH_ID = 'cuid_batch_1'
const CLIENT_ID = 'cuid_client_1'
const SESSION_ID = 'cuid_session_1'

function primeReviewerResolve(): void {
  vi.mocked(verifyToken).mockReturnValue({ magicLinkId: MAGIC_LINK_ID } as never)
  vi.mocked(findByTokenHash).mockResolvedValue({
    id: MAGIC_LINK_ID,
    batchId: BATCH_ID,
    revokedAt: null,
    batch: { id: BATCH_ID, clientId: CLIENT_ID, deletedAt: null },
  } as never)
  vi.mocked(cookies).mockResolvedValue({
    get: () => ({ value: 'signed-cookie-value' }),
  } as never)
  vi.mocked(verifySession).mockReturnValue({
    magicLinkId: MAGIC_LINK_ID,
    reviewerId: REVIEWER_ID,
  } as never)
  // The action calls findUnique twice: once during resolveReviewerForToken
  // (full row) and once for the reply-to email lookup. Both should resolve
  // to the same reviewer; a single mockResolvedValue covers both calls.
  vi.mocked(db.magicLinkReviewer.findUnique).mockResolvedValue({
    id: REVIEWER_ID,
    magicLinkId: MAGIC_LINK_ID,
    name: 'Jane Client',
    email: 'jane@client.com',
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: no client-left pins on any post in the batch. Tests that
  // exercise the Pins subsection override this with a per-test
  // mockResolvedValueOnce.
  vi.mocked(db.postThread.findMany).mockResolvedValue([] as never)
  // Default: the relay advance is a harmless no-op. Without this, a bare
  // vi.fn() resolves to undefined and `moved.advanced` throws into
  // advanceError, silently degrading every submit test that does not set
  // its own return. The advance-specific tests below override per-test.
  vi.mocked(advanceFromClientReview).mockResolvedValue({
    advanced: false,
    reason: 'not_at_client_step',
  })
  // Default: batch is editable. Tests that check the lock override per-test.
  vi.mocked(assertBatchEditable).mockResolvedValue(undefined)
})

describe('startReviewSessionAction — by-link resume', () => {
  it('reuses the link active session regardless of reviewerId', async () => {
    primeReviewerResolve()
    vi.mocked(findActiveClientSessionForLink).mockResolvedValue({ id: 'existing' } as never)
    const res = await startReviewSessionAction({ token: TOKEN })
    expect(res).toEqual({ reviewSessionId: 'existing' })
    expect(startSession).not.toHaveBeenCalled()
  })

  it('returns the submitted session id without creating a new round-1', async () => {
    primeReviewerResolve()
    vi.mocked(findActiveClientSessionForLink).mockResolvedValue(null)
    vi.mocked(findLatestClientSessionForLink).mockResolvedValue({ id: 'done', status: 'submitted' } as never)
    const res = await startReviewSessionAction({ token: TOKEN })
    expect(res).toEqual({ reviewSessionId: 'done' })
    expect(startSession).not.toHaveBeenCalled()
  })

  it('creates round-1 when the link has no prior session', async () => {
    primeReviewerResolve()
    vi.mocked(findActiveClientSessionForLink).mockResolvedValue(null)
    vi.mocked(findLatestClientSessionForLink).mockResolvedValue(null)
    vi.mocked(startSession).mockResolvedValue({ id: 'new' } as never)
    const res = await startReviewSessionAction({ token: TOKEN })
    expect(res).toEqual({ reviewSessionId: 'new' })
  })
})

describe('saveReviewDraftAction — post-submit guard', () => {
  it('throws when the current round is already submitted', async () => {
    primeReviewerResolve()
    vi.mocked(findActiveClientSessionForLink).mockResolvedValue(null)
    vi.mocked(findLatestClientSessionForLink).mockResolvedValue({ id: 'done', status: 'submitted' } as never)
    await expect(
      saveReviewDraftAction({ token: TOKEN, postId: 'p1', decision: 'approved' }),
    ).rejects.toThrow('Review already submitted')
    expect(startSession).not.toHaveBeenCalled()
  })
})

describe('submitSessionAction', () => {
  it('happy path: flips status, sends digest, emits activity, returns summary', async () => {
    primeReviewerResolve()
    vi.mocked(findActiveClientSessionForLink).mockResolvedValue({
      id: SESSION_ID,
      magicLinkId: MAGIC_LINK_ID,
      reviewerId: REVIEWER_ID,
      round: 1,
      status: 'in_progress',
    } as never)
    vi.mocked(findSessionWithItems).mockResolvedValue({
      id: SESSION_ID,
      magicLinkId: MAGIC_LINK_ID,
      reviewerId: REVIEWER_ID,
      status: 'in_progress',
      round: 1,
      startedAt: new Date(),
      submittedAt: null,
      submittedSummary: null,
      items: [
        {
          id: 'item_1',
          postId: 'post_1',
          decision: 'approved',
          comment: null,
          suggestedCaption: null,
          acceptedAsPostVersionId: null,
          updatedSinceLastReview: false,
          lastReviewedVersionId: null,
          reviewedAt: new Date(),
        },
        {
          id: 'item_2',
          postId: 'post_2',
          decision: 'changes_requested',
          comment: 'tighten this',
          suggestedCaption: null,
          acceptedAsPostVersionId: null,
          updatedSinceLastReview: false,
          lastReviewedVersionId: null,
          reviewedAt: new Date(),
        },
      ],
    } as never)
    const submittedAt = new Date('2026-05-16T14:30:00Z')
    vi.mocked(submitSession).mockResolvedValue({
      id: SESSION_ID,
      round: 1,
      status: 'submitted',
      submittedAt,
      submittedSummary: {
        approved: 1,
        changesRequested: 1,
        captionEdited: 0,
        totalPosts: 2,
      },
    } as never)
    vi.mocked(db.magicLink.findUnique).mockResolvedValue({
      id: MAGIC_LINK_ID,
      batchId: BATCH_ID,
      creator: {
        id: 'user_creator',
        name: 'Caleb Cody',
        email: 'caleb@fonmarketing.com',
      },
      batch: {
        id: BATCH_ID,
        clientId: CLIENT_ID,
        label: 'May 2026',
        scheduledAt: new Date('2026-05-01T00:00:00Z'),
        client: {
          id: CLIENT_ID,
          name: 'Akkoo Coffee',
          assignedAmId: 'user_assigned',
          assignedDesignerId: null,
          assignedAm: {
            id: 'user_assigned',
            name: 'Mollie Huebner',
            email: 'mollie@fonmarketing.com',
          },
        },
      },
    } as never)
    vi.mocked(db.post.findMany).mockResolvedValue([
      {
        id: 'post_1',
        postDate: new Date('2026-05-05T00:00:00Z'),
        caption: 'caption one',
      },
      {
        id: 'post_2',
        postDate: new Date('2026-05-07T00:00:00Z'),
        caption: 'caption two original',
      },
    ] as never)
    vi.mocked(sendEmail).mockResolvedValue({ id: 'resend_msg_1' } as never)

    const result = await submitSessionAction({ token: TOKEN })

    expect(result.ok).toBe(true)
    expect(result.summary).toEqual({
      approved: 1,
      changesRequested: 1,
      captionEdited: 0,
      totalPosts: 2,
    })
    expect(result.emailError).toBeUndefined()

    // Status flipped via the repo.
    expect(submitSession).toHaveBeenCalledWith({ reviewSessionId: SESSION_ID })

    // Activity event emitted with the correct kind + payload shape.
    expect(recordActivity).toHaveBeenCalledTimes(1)
    const activityInput = vi.mocked(recordActivity).mock.calls[0][0]
    expect(activityInput.clientId).toBe(CLIENT_ID)
    expect(activityInput.kind).toBe(ActivityKind.review_session_submitted)
    expect(activityInput.actorId).toBeNull()
    expect(activityInput.payload).toMatchObject({
      // batchId lets the notification deep-link to the review session detail
      // page instead of falling back to the generic client page.
      batchId: BATCH_ID,
      reviewSessionId: SESSION_ID,
      magicLinkId: MAGIC_LINK_ID,
      round: 1,
      summary: {
        approved: 1,
        changesRequested: 1,
        captionEdited: 0,
        totalPosts: 2,
      },
    })

    // Email sent twice , once to the link creator, once to the assigned
    // AM (because they differ).
    expect(sendEmail).toHaveBeenCalledTimes(2)
    const firstSend = vi.mocked(sendEmail).mock.calls[0][0]
    const secondSend = vi.mocked(sendEmail).mock.calls[1][0]
    expect([firstSend.to, secondSend.to].sort()).toEqual([
      'caleb@fonmarketing.com',
      'mollie@fonmarketing.com',
    ])
    expect(firstSend.subject).toContain('Akkoo Coffee')
    expect(firstSend.subject).toContain('May 2026')
    // Reply-to routes to the reviewer so AM hitting Reply lands in the
    // client's inbox.
    expect(firstSend.replyTo).toBe('jane@client.com')
    expect(secondSend.replyTo).toBe('jane@client.com')
    expect(firstSend.react).toBeDefined()
  })

  it('fetches open client-left pins for the batch and renders them on the digest item (Wave J4)', async () => {
    primeReviewerResolve()
    vi.mocked(findActiveClientSessionForLink).mockResolvedValue({
      id: SESSION_ID,
      magicLinkId: MAGIC_LINK_ID,
      reviewerId: REVIEWER_ID,
      round: 1,
      status: 'in_progress',
    } as never)
    vi.mocked(findSessionWithItems).mockResolvedValue({
      id: SESSION_ID,
      magicLinkId: MAGIC_LINK_ID,
      reviewerId: REVIEWER_ID,
      status: 'in_progress',
      round: 1,
      startedAt: new Date(),
      submittedAt: null,
      submittedSummary: null,
      items: [
        {
          id: 'item_1',
          postId: 'post_1',
          decision: 'changes_requested',
          comment: 'tighten this',
          suggestedCaption: null,
          acceptedAsPostVersionId: null,
          updatedSinceLastReview: false,
          lastReviewedVersionId: null,
          reviewedAt: new Date(),
        },
      ],
    } as never)
    vi.mocked(submitSession).mockResolvedValue({
      id: SESSION_ID,
      round: 1,
      submittedAt: new Date('2026-05-09T13:42:00Z'),
      submittedSummary: {
        approved: 0,
        changesRequested: 1,
        captionEdited: 0,
        totalPosts: 1,
      },
    } as never)
    vi.mocked(db.magicLink.findUnique).mockResolvedValue({
      id: MAGIC_LINK_ID,
      batchId: BATCH_ID,
      creator: {
        id: 'user_creator',
        name: 'Caleb Cody',
        email: 'caleb@fonmarketing.com',
      },
      batch: {
        id: BATCH_ID,
        clientId: CLIENT_ID,
        label: 'May 2026',
        scheduledAt: new Date('2026-05-01T00:00:00Z'),
        client: {
          id: CLIENT_ID,
          name: 'Akkoo Coffee',
          assignedAmId: null,
          assignedDesignerId: null,
          assignedAm: null,
        },
      },
    } as never)
    vi.mocked(db.post.findMany).mockResolvedValue([
      {
        id: 'post_1',
        postDate: new Date('2026-05-05T00:00:00Z'),
        caption: 'caption one',
      },
    ] as never)
    // Two open, client-left pins on post_1: one image pin, one caption pin.
    vi.mocked(db.postThread.findMany).mockResolvedValue([
      {
        id: 'thread_a',
        postId: 'post_1',
        imageX: 15,
        imageY: 20,
        captionFrom: null,
        captionTo: null,
        comments: [{ body: 'fix this typo', reviewerName: 'Jane' }],
      },
      {
        id: 'thread_b',
        postId: 'post_1',
        imageX: null,
        imageY: null,
        captionFrom: 4,
        captionTo: 13,
        comments: [{ body: 'wording feels off here', reviewerName: 'Jane' }],
      },
    ] as never)
    vi.mocked(sendEmail).mockResolvedValue({ id: 'resend_msg_pins' } as never)

    const result = await submitSessionAction({ token: TOKEN })

    expect(result.ok).toBe(true)
    expect(result.emailError).toBeUndefined()

    // Query was scoped to: open status, client-left only, posts in this batch.
    const pinQuery = vi.mocked(db.postThread.findMany).mock.calls[0][0]
    expect(pinQuery).toBeDefined()
    expect(pinQuery!.where).toMatchObject({
      status: 'open',
      reviewerToken: { not: null },
    })
    const postIdIn = (pinQuery!.where as { postId: { in: string[] } }).postId.in
    expect(postIdIn).toContain('post_1')

    // The send call carries a react node populated with pins; we render
    // it through the test by reading the email props off of the second
    // arg the email module would have received. Simplest assertion: the
    // sendEmail call happened once (single recipient) and the react node
    // was provided.
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const send = vi.mocked(sendEmail).mock.calls[0][0]
    expect(send.to).toBe('caleb@fonmarketing.com')
    expect(send.react).toBeDefined()
  })

  it('throws when the active session has no items, and does NOT submit or send', async () => {
    primeReviewerResolve()
    vi.mocked(findActiveClientSessionForLink).mockResolvedValue({
      id: SESSION_ID,
      magicLinkId: MAGIC_LINK_ID,
      reviewerId: REVIEWER_ID,
      round: 1,
      status: 'in_progress',
    } as never)
    vi.mocked(findSessionWithItems).mockResolvedValue({
      id: SESSION_ID,
      magicLinkId: MAGIC_LINK_ID,
      reviewerId: REVIEWER_ID,
      status: 'in_progress',
      round: 1,
      startedAt: new Date(),
      submittedAt: null,
      submittedSummary: null,
      items: [],
    } as never)

    await expect(submitSessionAction({ token: TOKEN })).rejects.toThrow(
      /Cannot submit a review with no decisions/,
    )

    expect(submitSession).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
    expect(recordActivity).not.toHaveBeenCalled()
  })

  it('mentions both AM and designer when both are assigned on the client', async () => {
    primeReviewerResolve()
    vi.mocked(findActiveClientSessionForLink).mockResolvedValue({
      id: SESSION_ID,
      magicLinkId: MAGIC_LINK_ID,
      reviewerId: REVIEWER_ID,
      round: 1,
      status: 'in_progress',
    } as never)
    vi.mocked(findSessionWithItems).mockResolvedValue({
      id: SESSION_ID,
      magicLinkId: MAGIC_LINK_ID,
      reviewerId: REVIEWER_ID,
      status: 'in_progress',
      round: 1,
      startedAt: new Date(),
      submittedAt: null,
      submittedSummary: null,
      items: [
        {
          id: 'item_1',
          postId: 'post_1',
          decision: 'approved',
          comment: null,
          suggestedCaption: null,
          acceptedAsPostVersionId: null,
          updatedSinceLastReview: false,
          lastReviewedVersionId: null,
          reviewedAt: new Date(),
        },
      ],
    } as never)
    vi.mocked(submitSession).mockResolvedValue({
      id: SESSION_ID,
      round: 1,
      status: 'submitted',
      submittedAt: new Date(),
      submittedSummary: {
        approved: 1,
        changesRequested: 0,
        captionEdited: 0,
        totalPosts: 1,
      },
    } as never)
    vi.mocked(db.magicLink.findUnique).mockResolvedValue({
      id: MAGIC_LINK_ID,
      batchId: BATCH_ID,
      creator: {
        id: 'user_creator',
        name: 'Caleb',
        email: 'caleb@fonmarketing.com',
      },
      batch: {
        id: BATCH_ID,
        clientId: CLIENT_ID,
        label: 'May 2026',
        scheduledAt: null,
        client: {
          id: CLIENT_ID,
          name: 'Akkoo Coffee',
          assignedAmId: 'user_am_123',
          assignedDesignerId: 'user_designer_456',
          assignedAm: {
            id: 'user_am_123',
            name: 'Mollie',
            email: 'mollie@fonmarketing.com',
          },
        },
      },
    } as never)
    vi.mocked(db.post.findMany).mockResolvedValue([
      {
        id: 'post_1',
        postDate: new Date('2026-05-05T00:00:00Z'),
        caption: 'caption one',
      },
    ] as never)
    vi.mocked(sendEmail).mockResolvedValue({ id: 'resend_msg_1' } as never)

    await submitSessionAction({ token: TOKEN })

    expect(recordActivity).toHaveBeenCalledTimes(1)
    const activityInput = vi.mocked(recordActivity).mock.calls[0][0]
    expect(activityInput.kind).toBe(ActivityKind.review_session_submitted)
    expect(activityInput.mentionedUserIds).toEqual(
      expect.arrayContaining(['user_am_123', 'user_designer_456']),
    )
    expect(activityInput.mentionedUserIds).toHaveLength(2)
  })

  it('mentions only the AM when assignedDesignerId is null', async () => {
    primeReviewerResolve()
    vi.mocked(findActiveClientSessionForLink).mockResolvedValue({
      id: SESSION_ID,
      magicLinkId: MAGIC_LINK_ID,
      reviewerId: REVIEWER_ID,
      round: 1,
      status: 'in_progress',
    } as never)
    vi.mocked(findSessionWithItems).mockResolvedValue({
      id: SESSION_ID,
      magicLinkId: MAGIC_LINK_ID,
      reviewerId: REVIEWER_ID,
      status: 'in_progress',
      round: 1,
      startedAt: new Date(),
      submittedAt: null,
      submittedSummary: null,
      items: [
        {
          id: 'item_1',
          postId: 'post_1',
          decision: 'approved',
          comment: null,
          suggestedCaption: null,
          acceptedAsPostVersionId: null,
          updatedSinceLastReview: false,
          lastReviewedVersionId: null,
          reviewedAt: new Date(),
        },
      ],
    } as never)
    vi.mocked(submitSession).mockResolvedValue({
      id: SESSION_ID,
      round: 1,
      status: 'submitted',
      submittedAt: new Date(),
      submittedSummary: {
        approved: 1,
        changesRequested: 0,
        captionEdited: 0,
        totalPosts: 1,
      },
    } as never)
    vi.mocked(db.magicLink.findUnique).mockResolvedValue({
      id: MAGIC_LINK_ID,
      batchId: BATCH_ID,
      creator: {
        id: 'user_creator',
        name: 'Caleb',
        email: 'caleb@fonmarketing.com',
      },
      batch: {
        id: BATCH_ID,
        clientId: CLIENT_ID,
        label: 'May 2026',
        scheduledAt: null,
        client: {
          id: CLIENT_ID,
          name: 'Akkoo Coffee',
          assignedAmId: 'user_am_123',
          // No designer assigned.
          assignedDesignerId: null,
          assignedAm: {
            id: 'user_am_123',
            name: 'Mollie',
            email: 'mollie@fonmarketing.com',
          },
        },
      },
    } as never)
    vi.mocked(db.post.findMany).mockResolvedValue([
      {
        id: 'post_1',
        postDate: new Date('2026-05-05T00:00:00Z'),
        caption: 'caption one',
      },
    ] as never)
    vi.mocked(sendEmail).mockResolvedValue({ id: 'resend_msg_1' } as never)

    await submitSessionAction({ token: TOKEN })

    expect(recordActivity).toHaveBeenCalledTimes(1)
    const activityInput = vi.mocked(recordActivity).mock.calls[0][0]
    expect(activityInput.mentionedUserIds).toEqual(['user_am_123'])
  })

  it('email failure does NOT roll back the submission , status still flipped, returns emailError', async () => {
    primeReviewerResolve()
    vi.mocked(findActiveClientSessionForLink).mockResolvedValue({
      id: SESSION_ID,
      magicLinkId: MAGIC_LINK_ID,
      reviewerId: REVIEWER_ID,
      round: 2,
      status: 'in_progress',
    } as never)
    vi.mocked(findSessionWithItems).mockResolvedValue({
      id: SESSION_ID,
      magicLinkId: MAGIC_LINK_ID,
      reviewerId: REVIEWER_ID,
      status: 'in_progress',
      round: 2,
      startedAt: new Date(),
      submittedAt: null,
      submittedSummary: null,
      items: [
        {
          id: 'item_a',
          postId: 'post_a',
          decision: 'approved',
          comment: null,
          suggestedCaption: null,
          acceptedAsPostVersionId: null,
          updatedSinceLastReview: false,
          lastReviewedVersionId: null,
          reviewedAt: new Date(),
        },
      ],
    } as never)
    const submittedAt = new Date('2026-05-16T15:00:00Z')
    vi.mocked(submitSession).mockResolvedValue({
      id: SESSION_ID,
      round: 2,
      status: 'submitted',
      submittedAt,
      submittedSummary: {
        approved: 1,
        changesRequested: 0,
        captionEdited: 0,
        totalPosts: 1,
      },
    } as never)
    vi.mocked(db.magicLink.findUnique).mockResolvedValue({
      id: MAGIC_LINK_ID,
      batchId: BATCH_ID,
      creator: {
        id: 'user_creator',
        name: 'Caleb',
        email: 'caleb@fonmarketing.com',
      },
      batch: {
        id: BATCH_ID,
        clientId: CLIENT_ID,
        label: 'May 2026',
        scheduledAt: null,
        client: {
          id: CLIENT_ID,
          name: 'Akkoo Coffee',
          // Same AM as the link creator , no CC.
          assignedAmId: 'user_creator',
          assignedDesignerId: null,
          assignedAm: {
            id: 'user_creator',
            name: 'Caleb',
            email: 'caleb@fonmarketing.com',
          },
        },
      },
    } as never)
    vi.mocked(db.post.findMany).mockResolvedValue([
      {
        id: 'post_a',
        postDate: new Date('2026-05-05T00:00:00Z'),
        caption: 'cap a',
      },
    ] as never)
    vi.mocked(sendEmail).mockRejectedValue(new Error('Resend down'))

    const result = await submitSessionAction({ token: TOKEN })

    // Submission still succeeded.
    expect(result.ok).toBe(true)
    expect(result.summary.approved).toBe(1)
    expect(result.emailError).toMatch(/Resend down/)

    // Status flip still happened.
    expect(submitSession).toHaveBeenCalledWith({ reviewSessionId: SESSION_ID })
    // Activity still emitted.
    expect(recordActivity).toHaveBeenCalledTimes(1)
    // Email send was attempted exactly once (single recipient, link creator
    // == assigned AM).
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  // Helper shared by the advanceFromClientReview tests.
  function primeAllApprovedSubmit(): void {
    primeReviewerResolve()
    vi.mocked(findActiveClientSessionForLink).mockResolvedValue({
      id: SESSION_ID,
      magicLinkId: MAGIC_LINK_ID,
      reviewerId: REVIEWER_ID,
      round: 1,
      status: 'in_progress',
    } as never)
    vi.mocked(findSessionWithItems).mockResolvedValue({
      id: SESSION_ID,
      magicLinkId: MAGIC_LINK_ID,
      reviewerId: REVIEWER_ID,
      status: 'in_progress',
      round: 1,
      startedAt: new Date(),
      submittedAt: null,
      submittedSummary: null,
      items: [
        {
          id: 'item_1',
          postId: 'post_1',
          decision: 'approved',
          comment: null,
          suggestedCaption: null,
          acceptedAsPostVersionId: null,
          updatedSinceLastReview: false,
          lastReviewedVersionId: null,
          reviewedAt: new Date(),
        },
      ],
    } as never)
    vi.mocked(submitSession).mockResolvedValue({
      id: SESSION_ID,
      round: 1,
      status: 'submitted',
      submittedAt: new Date(),
      submittedSummary: {
        approved: 1,
        changesRequested: 0,
        captionEdited: 0,
        totalPosts: 1,
      },
    } as never)
    vi.mocked(db.magicLink.findUnique).mockResolvedValue({
      id: MAGIC_LINK_ID,
      batchId: BATCH_ID,
      creator: {
        id: 'user_creator',
        name: 'Caleb Cody',
        email: 'caleb@fonmarketing.com',
      },
      batch: {
        id: BATCH_ID,
        clientId: CLIENT_ID,
        label: 'June 2026',
        scheduledAt: null,
        client: {
          id: CLIENT_ID,
          name: 'Akkoo Coffee',
          assignedAmId: null,
          assignedDesignerId: null,
          assignedAm: null,
        },
      },
    } as never)
    vi.mocked(db.post.findMany).mockResolvedValue([
      {
        id: 'post_1',
        postDate: new Date('2026-06-05T00:00:00Z'),
        caption: 'caption one',
      },
    ] as never)
    vi.mocked(sendEmail).mockResolvedValue({ id: 'resend_msg_adv' } as never)
  }

  it('calls advanceFromClientReview with the mapped target on submit', async () => {
    primeAllApprovedSubmit()
    vi.mocked(advanceFromClientReview).mockResolvedValue({ advanced: false, reason: 'not_at_client_step' })

    await submitSessionAction({ token: TOKEN })

    expect(advanceFromClientReview).toHaveBeenCalledTimes(1)
    const call = vi.mocked(advanceFromClientReview).mock.calls[0][0]
    expect(call.decision).toBe('approved')
    expect(call.batchId).toBe(BATCH_ID)
    expect(call.reviewerName).toBe('Jane Client')
    expect(call.fallbackUserId).toBe('user_creator')
  })

  it('P1 #16: an approved post that carries a saved copy edit routes to "changes"', async () => {
    primeAllApprovedSubmit()
    // The single approved item also carries a copy edit -> not a clean approval.
    vi.mocked(findSessionWithItems).mockResolvedValue({
      id: SESSION_ID,
      magicLinkId: MAGIC_LINK_ID,
      reviewerId: REVIEWER_ID,
      status: 'in_progress',
      round: 1,
      startedAt: new Date(),
      submittedAt: null,
      submittedSummary: null,
      items: [
        {
          id: 'item_1',
          postId: 'post_1',
          decision: 'approved',
          comment: null,
          suggestedCaption: 'a better caption',
          acceptedAsPostVersionId: null,
          updatedSinceLastReview: false,
          lastReviewedVersionId: null,
          reviewedAt: new Date(),
        },
      ],
    } as never)
    vi.mocked(advanceFromClientReview).mockResolvedValue({ advanced: false, reason: 'not_at_client_step' })

    await submitSessionAction({ token: TOKEN })

    expect(vi.mocked(advanceFromClientReview).mock.calls[0][0].decision).toBe('changes')
  })

  it('P1 #16: an approved post with an open client pin routes to "changes"', async () => {
    primeAllApprovedSubmit()
    // The single approved item (post_1) still has an open client-left pin.
    vi.mocked(db.postThread.findMany).mockResolvedValue([
      {
        id: 'thread_a',
        postId: 'post_1',
        imageX: 10,
        imageY: 20,
        captionFrom: null,
        captionTo: null,
        comments: [{ body: 'move this', reviewerName: 'Jane' }],
      },
    ] as never)
    vi.mocked(advanceFromClientReview).mockResolvedValue({ advanced: false, reason: 'not_at_client_step' })

    await submitSessionAction({ token: TOKEN })

    expect(vi.mocked(advanceFromClientReview).mock.calls[0][0].decision).toBe('changes')
  })

  it('any-change summary maps to decision "changes"', async () => {
    primeReviewerResolve()
    vi.mocked(findActiveClientSessionForLink).mockResolvedValue({
      id: SESSION_ID,
      magicLinkId: MAGIC_LINK_ID,
      reviewerId: REVIEWER_ID,
      round: 1,
      status: 'in_progress',
    } as never)
    vi.mocked(findSessionWithItems).mockResolvedValue({
      id: SESSION_ID,
      magicLinkId: MAGIC_LINK_ID,
      reviewerId: REVIEWER_ID,
      status: 'in_progress',
      round: 1,
      startedAt: new Date(),
      submittedAt: null,
      submittedSummary: null,
      items: [
        {
          id: 'item_1',
          postId: 'post_1',
          decision: 'changes_requested',
          comment: 'fix this',
          suggestedCaption: null,
          acceptedAsPostVersionId: null,
          updatedSinceLastReview: false,
          lastReviewedVersionId: null,
          reviewedAt: new Date(),
        },
      ],
    } as never)
    vi.mocked(submitSession).mockResolvedValue({
      id: SESSION_ID,
      round: 1,
      status: 'submitted',
      submittedAt: new Date(),
      submittedSummary: {
        approved: 0,
        changesRequested: 1,
        captionEdited: 0,
        totalPosts: 1,
      },
    } as never)
    vi.mocked(db.magicLink.findUnique).mockResolvedValue({
      id: MAGIC_LINK_ID,
      batchId: BATCH_ID,
      creator: {
        id: 'user_creator',
        name: 'Caleb Cody',
        email: 'caleb@fonmarketing.com',
      },
      batch: {
        id: BATCH_ID,
        clientId: CLIENT_ID,
        label: 'June 2026',
        scheduledAt: null,
        client: {
          id: CLIENT_ID,
          name: 'Akkoo Coffee',
          assignedAmId: null,
          assignedDesignerId: null,
          assignedAm: null,
        },
      },
    } as never)
    vi.mocked(db.post.findMany).mockResolvedValue([
      {
        id: 'post_1',
        postDate: new Date('2026-06-05T00:00:00Z'),
        caption: 'caption one',
      },
    ] as never)
    vi.mocked(sendEmail).mockResolvedValue({ id: 'resend_msg_chg' } as never)
    vi.mocked(advanceFromClientReview).mockResolvedValue({ advanced: false, reason: 'not_at_client_step' })

    await submitSessionAction({ token: TOKEN })

    expect(advanceFromClientReview).toHaveBeenCalledTimes(1)
    const call = vi.mocked(advanceFromClientReview).mock.calls[0][0]
    expect(call.decision).toBe('changes')
  })

  it('partial review (approved < batch post count) maps to decision "changes" — regression for touched-item denominator bug', async () => {
    // The bug: summary.totalPosts == items.length (only touched posts).
    // A client who approves 3 of 10 posts produces { approved: 3, totalPosts: 3 }
    // which under the OLD code looked like "all approved". The fix uses
    // posts.length from db.post.findMany (the actual batch post count) instead.
    primeReviewerResolve()
    vi.mocked(findActiveClientSessionForLink).mockResolvedValue({
      id: SESSION_ID,
      magicLinkId: MAGIC_LINK_ID,
      reviewerId: REVIEWER_ID,
      round: 1,
      status: 'in_progress',
    } as never)
    vi.mocked(findSessionWithItems).mockResolvedValue({
      id: SESSION_ID,
      magicLinkId: MAGIC_LINK_ID,
      reviewerId: REVIEWER_ID,
      status: 'in_progress',
      round: 1,
      startedAt: new Date(),
      submittedAt: null,
      submittedSummary: null,
      items: [
        { id: 'item_1', postId: 'post_1', decision: 'approved', comment: null, suggestedCaption: null, acceptedAsPostVersionId: null, updatedSinceLastReview: false, lastReviewedVersionId: null, reviewedAt: new Date() },
        { id: 'item_2', postId: 'post_2', decision: 'approved', comment: null, suggestedCaption: null, acceptedAsPostVersionId: null, updatedSinceLastReview: false, lastReviewedVersionId: null, reviewedAt: new Date() },
        { id: 'item_3', postId: 'post_3', decision: 'approved', comment: null, suggestedCaption: null, acceptedAsPostVersionId: null, updatedSinceLastReview: false, lastReviewedVersionId: null, reviewedAt: new Date() },
      ],
    } as never)
    // summary reflects only 3 touched posts — this is what the old code would
    // have mistaken for "all approved" on a 3-post batch.
    vi.mocked(submitSession).mockResolvedValue({
      id: SESSION_ID,
      round: 1,
      status: 'submitted',
      submittedAt: new Date(),
      submittedSummary: {
        approved: 3,
        changesRequested: 0,
        captionEdited: 0,
        totalPosts: 3,
      },
    } as never)
    vi.mocked(db.magicLink.findUnique).mockResolvedValue({
      id: MAGIC_LINK_ID,
      batchId: BATCH_ID,
      creator: {
        id: 'user_creator',
        name: 'Caleb Cody',
        email: 'caleb@fonmarketing.com',
      },
      batch: {
        id: BATCH_ID,
        clientId: CLIENT_ID,
        label: 'June 2026',
        scheduledAt: null,
        client: {
          id: CLIENT_ID,
          name: 'Akkoo Coffee',
          assignedAmId: null,
          assignedDesignerId: null,
          assignedAm: null,
        },
      },
    } as never)
    // The batch actually has 5 posts — 2 were never touched by the reviewer.
    vi.mocked(db.post.findMany).mockResolvedValue([
      { id: 'post_1', postDate: new Date('2026-06-01T00:00:00Z'), caption: 'c1' },
      { id: 'post_2', postDate: new Date('2026-06-02T00:00:00Z'), caption: 'c2' },
      { id: 'post_3', postDate: new Date('2026-06-03T00:00:00Z'), caption: 'c3' },
      { id: 'post_4', postDate: new Date('2026-06-04T00:00:00Z'), caption: 'c4' },
      { id: 'post_5', postDate: new Date('2026-06-05T00:00:00Z'), caption: 'c5' },
    ] as never)
    vi.mocked(sendEmail).mockResolvedValue({ id: 'resend_msg_partial' } as never)
    vi.mocked(advanceFromClientReview).mockResolvedValue({ advanced: false, reason: 'not_at_client_step' })

    await submitSessionAction({ token: TOKEN })

    expect(advanceFromClientReview).toHaveBeenCalledTimes(1)
    const call = vi.mocked(advanceFromClientReview).mock.calls[0][0]
    // Must be 'changes', not 'approved', because 3 approved < 5 batch posts.
    expect(call.decision).toBe('changes')
  })

  it('advance failure does not fail the submit and surfaces advanceError', async () => {
    primeAllApprovedSubmit()
    vi.mocked(advanceFromClientReview).mockRejectedValue(new Error('relay DB down'))

    const result = await submitSessionAction({ token: TOKEN })

    expect(result.ok).toBe(true)
    expect((result as { advanceError?: string }).advanceError).toMatch(/relay DB down/)
  })

  it('successful advance is reported on the result', async () => {
    primeAllApprovedSubmit()
    vi.mocked(advanceFromClientReview).mockResolvedValue({
      advanced: true,
      toStep: 'ready_to_schedule' as never,
      newHolderId: 'user_am',
    })

    const result = await submitSessionAction({ token: TOKEN })

    expect(result.ok).toBe(true)
    expect((result as { advanced?: { toStep: string; newHolderId: string } }).advanced).toEqual({
      toStep: 'ready_to_schedule',
      newHolderId: 'user_am',
    })
  })
})

// ---- AM-side actions ----

const AM_USER_DB_ID = 'user_am_1'
const REVIEW_ITEM_ID = 'cuid_item_1'
const POST_ID = 'cuid_post_1'

function primeAmCtx(): void {
  vi.mocked(requireClientEditor).mockResolvedValue({
    userId: 'clerk_user_am',
    orgId: 'clerk_org_1',
    role: 'account_manager',
    plan: 'smb',
    organizationDbId: 'org_db_1',
    userDbId: AM_USER_DB_ID,
    platformOwner: false,
    linkedClientId: null,
    permissionOverrides: null,
    roleDefaults: {},
  } as never)
  vi.mocked(findClientForUser).mockResolvedValue({
    id: CLIENT_ID,
    name: 'Akkoo Coffee',
  } as never)
}

function primeAmReviewItem(
  overrides: Partial<{
    decision: string
    comment: string | null
    suggestedCaption: string | null
    acceptedAsPostVersionId: string | null
    caption: string
    hashtags: string[]
  }> = {},
): void {
  vi.mocked(db.reviewItem.findUnique).mockResolvedValue({
    id: REVIEW_ITEM_ID,
    reviewSessionId: SESSION_ID,
    postId: POST_ID,
    decision: overrides.decision ?? 'caption_edited',
    comment: overrides.comment ?? null,
    suggestedCaption: overrides.suggestedCaption ?? 'new caption from client',
    acceptedAsPostVersionId: overrides.acceptedAsPostVersionId ?? null,
    post: {
      id: POST_ID,
      caption: overrides.caption ?? 'old caption',
      hashtags: overrides.hashtags ?? ['#one', '#two'],
      graphicHook: null,
      designerNotes: null,
    },
    reviewSession: {
      id: SESSION_ID,
      magicLinkId: MAGIC_LINK_ID,
      batchId: BATCH_ID,
      batch: { id: BATCH_ID, clientId: CLIENT_ID },
    },
  } as never)
}

describe('acceptCaptionEditAction', () => {
  it('snapshots a new PostVersion, updates Post.caption, marks the item accepted, emits activity', async () => {
    primeAmCtx()
    primeAmReviewItem({
      decision: 'caption_edited',
      suggestedCaption: 'New shiny caption.',
      caption: 'Old boring caption.',
    })
    vi.mocked(snapshotPostVersion).mockResolvedValue({ id: 'pv_new' })
    // db.$transaction([...]) just executes whatever array we give it; we
    // do not need to actually run the updates in the mock — the action
    // does not read their return values.
    vi.mocked(db.$transaction).mockResolvedValue([{}, {}] as never)

    const result = await acceptCaptionEditAction({ reviewItemId: REVIEW_ITEM_ID })

    expect(result.ok).toBe(true)
    expect(result.postVersionId).toBe('pv_new')

    expect(snapshotPostVersion).toHaveBeenCalledWith({
      postId: POST_ID,
      authorId: AM_USER_DB_ID,
      body: {
        caption: 'New shiny caption.',
        hashtags: ['#one', '#two'],
        graphicHook: null,
        designerNotes: null,
      },
    })
    expect(db.$transaction).toHaveBeenCalledTimes(1)

    expect(recordActivity).toHaveBeenCalledTimes(1)
    const activity = vi.mocked(recordActivity).mock.calls[0][0]
    expect(activity.kind).toBe(ActivityKind.review_caption_edit_accepted)
    expect(activity.clientId).toBe(CLIENT_ID)
    expect(activity.actorId).toBe(AM_USER_DB_ID)
    expect(activity.payload).toMatchObject({
      postId: POST_ID,
      reviewItemId: REVIEW_ITEM_ID,
      oldCaption: 'Old boring caption.',
      newCaption: 'New shiny caption.',
      postVersionId: 'pv_new',
    })
  })

  it('throws when the item is not a caption_edited decision', async () => {
    primeAmCtx()
    primeAmReviewItem({ decision: 'changes_requested' })

    await expect(
      acceptCaptionEditAction({ reviewItemId: REVIEW_ITEM_ID }),
    ).rejects.toThrow(/Cannot accept caption edit/)

    expect(snapshotPostVersion).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(recordActivity).not.toHaveBeenCalled()
  })

  it('rejects with RelayCompletedError and does not call db.post.update when the batch is completed', async () => {
    primeAmCtx()
    primeAmReviewItem({ decision: 'caption_edited', suggestedCaption: 'New caption' })
    vi.mocked(assertBatchEditable).mockRejectedValueOnce(new RelayCompletedError())

    await expect(
      acceptCaptionEditAction({ reviewItemId: REVIEW_ITEM_ID }),
    ).rejects.toThrow(RelayCompletedError)

    expect(snapshotPostVersion).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(recordActivity).not.toHaveBeenCalled()
  })
})

describe('rejectCaptionEditAction', () => {
  it('emits a review_item_addressed event and does NOT touch the post or reviewItem', async () => {
    primeAmCtx()
    primeAmReviewItem({ decision: 'caption_edited' })

    const result = await rejectCaptionEditAction({ reviewItemId: REVIEW_ITEM_ID })

    expect(result.ok).toBe(true)
    expect(snapshotPostVersion).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()

    expect(recordActivity).toHaveBeenCalledTimes(1)
    const activity = vi.mocked(recordActivity).mock.calls[0][0]
    expect(activity.kind).toBe(ActivityKind.review_item_addressed)
    expect(activity.actorId).toBe(AM_USER_DB_ID)
    expect(activity.payload).toMatchObject({
      reviewItemId: REVIEW_ITEM_ID,
      postId: POST_ID,
      decision: 'caption_edited',
      action: 'rejected_caption_edit',
    })
  })
})

describe('addressItemAction', () => {
  it('emits a review_item_addressed event for a changes_requested item', async () => {
    primeAmCtx()
    primeAmReviewItem({
      decision: 'changes_requested',
      comment: 'Tighten the intro',
      suggestedCaption: null,
    })

    const result = await addressItemAction({ reviewItemId: REVIEW_ITEM_ID })

    expect(result.ok).toBe(true)
    expect(recordActivity).toHaveBeenCalledTimes(1)
    const activity = vi.mocked(recordActivity).mock.calls[0][0]
    expect(activity.kind).toBe(ActivityKind.review_item_addressed)
    expect(activity.clientId).toBe(CLIENT_ID)
    expect(activity.actorId).toBe(AM_USER_DB_ID)
    expect(activity.payload).toMatchObject({
      postId: POST_ID,
      reviewItemId: REVIEW_ITEM_ID,
      decision: 'changes_requested',
      addressedBy: AM_USER_DB_ID,
    })
  })

  it('persists addressedAt + addressedBy on the ReviewItem', async () => {
    primeAmCtx()
    primeAmReviewItem({
      decision: 'changes_requested',
      comment: 'Fix the copy',
      suggestedCaption: null,
    })

    await addressItemAction({ reviewItemId: REVIEW_ITEM_ID })

    expect(db.reviewItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: REVIEW_ITEM_ID },
        data: expect.objectContaining({
          addressedAt: expect.any(Date),
          addressedBy: AM_USER_DB_ID,
        }),
      }),
    )
  })

  it('throws when the item is approved or not_reviewed', async () => {
    primeAmCtx()
    primeAmReviewItem({ decision: 'approved' })

    await expect(
      addressItemAction({ reviewItemId: REVIEW_ITEM_ID }),
    ).rejects.toThrow(/Cannot mark a approved item as addressed/)

    expect(recordActivity).not.toHaveBeenCalled()
  })
})

describe('rejectCaptionEditAction — addressedAt persistence', () => {
  it('persists addressedAt + addressedBy on the ReviewItem after emitting activity', async () => {
    primeAmCtx()
    primeAmReviewItem({ decision: 'caption_edited' })

    const result = await rejectCaptionEditAction({ reviewItemId: REVIEW_ITEM_ID })

    expect(result.ok).toBe(true)
    expect(db.reviewItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: REVIEW_ITEM_ID },
        data: expect.objectContaining({
          addressedAt: expect.any(Date),
          addressedBy: AM_USER_DB_ID,
        }),
      }),
    )
  })
})

describe('markPostAddressedAction — addressedAt persistence', () => {
  const MARK_POST_ID = 'cuid_post_mark'
  const MARK_ITEM_ID = 'cuid_item_mark'
  const MARK_SESSION_ID = 'cuid_session_mark'

  function primeMarkPost(decision: string = 'changes_requested'): void {
    vi.mocked(db.post.findUnique).mockResolvedValue({
      id: MARK_POST_ID,
      clientId: CLIENT_ID,
      batchId: BATCH_ID,
    } as never)
    vi.mocked(db.reviewItem.findUnique).mockResolvedValue({
      id: MARK_ITEM_ID,
      postId: MARK_POST_ID,
      decision,
    } as never)
    vi.mocked(bulkResolveOnPost).mockResolvedValue(0)
  }

  it('persists addressedAt + addressedBy on the ReviewItem for a changes_requested item', async () => {
    primeAmCtx()
    primeMarkPost('changes_requested')

    await markPostAddressedAction({
      postId: MARK_POST_ID,
      reviewItemId: MARK_ITEM_ID,
      reviewSessionId: MARK_SESSION_ID,
    })

    expect(db.reviewItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MARK_ITEM_ID },
        data: expect.objectContaining({
          addressedAt: expect.any(Date),
          addressedBy: AM_USER_DB_ID,
        }),
      }),
    )
  })

  it('persists addressedAt + addressedBy on the ReviewItem for a caption_edited item', async () => {
    primeAmCtx()
    primeMarkPost('caption_edited')

    await markPostAddressedAction({
      postId: MARK_POST_ID,
      reviewItemId: MARK_ITEM_ID,
      reviewSessionId: MARK_SESSION_ID,
    })

    expect(db.reviewItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MARK_ITEM_ID },
        data: expect.objectContaining({
          addressedAt: expect.any(Date),
          addressedBy: AM_USER_DB_ID,
        }),
      }),
    )
  })

  it('does NOT call db.reviewItem.update for an approved item', async () => {
    primeAmCtx()
    primeMarkPost('approved')

    await markPostAddressedAction({
      postId: MARK_POST_ID,
      reviewItemId: MARK_ITEM_ID,
      reviewSessionId: MARK_SESSION_ID,
    })

    expect(db.reviewItem.update).not.toHaveBeenCalled()
  })

  it('also stamps noteResolvedAt + noteResolvedBy when marking a changes_requested post addressed', async () => {
    primeAmCtx()
    primeMarkPost('changes_requested')

    await markPostAddressedAction({
      postId: MARK_POST_ID,
      reviewItemId: MARK_ITEM_ID,
      reviewSessionId: MARK_SESSION_ID,
    })

    expect(db.reviewItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MARK_ITEM_ID },
        data: expect.objectContaining({
          addressedAt: expect.any(Date),
          addressedBy: AM_USER_DB_ID,
          noteResolvedAt: expect.any(Date),
          noteResolvedBy: AM_USER_DB_ID,
        }),
      }),
    )
  })
})

describe('startNextRoundAction', () => {
  it('calls startNextRound, sends the magic link email, and returns the new session id', async () => {
    primeAmCtx()
    vi.mocked(db.magicLink.findUnique).mockResolvedValue({
      id: MAGIC_LINK_ID,
      batchId: BATCH_ID,
      revokedAt: null,
      expiresAt: new Date('2026-12-31T00:00:00Z'),
      defaultReviewerName: 'Jane Client',
      defaultReviewerEmail: 'jane@client.com',
      batch: {
        id: BATCH_ID,
        clientId: CLIENT_ID,
        scheduledAt: new Date('2026-06-01T00:00:00Z'),
        label: 'June 2026',
      },
      creator: { id: 'user_creator', name: 'Caleb', email: 'caleb@fonmarketing.com' },
    } as never)
    vi.mocked(startNextRound).mockResolvedValue({
      id: 'session_2',
      round: 2,
    } as never)
    vi.mocked(sendMagicLinkEmail).mockResolvedValue({ messageId: 'm_1' } as never)

    const result = await startNextRoundAction({ magicLinkId: MAGIC_LINK_ID })

    expect(result.ok).toBe(true)
    expect(result.newSessionId).toBe('session_2')
    expect(result.newRound).toBe(2)
    expect(result.emailError).toBeUndefined()

    expect(startNextRound).toHaveBeenCalledWith({
      magicLinkId: MAGIC_LINK_ID,
      by: AM_USER_DB_ID,
    })
    expect(sendMagicLinkEmail).toHaveBeenCalledTimes(1)
    const sendArgs = vi.mocked(sendMagicLinkEmail).mock.calls[0][0]
    expect(sendArgs.recipientEmail).toBe('jane@client.com')
    expect(sendArgs.recipientName).toBe('Jane Client')
    expect(sendArgs.clientName).toBe('Akkoo Coffee')
    // The signToken mock returns the literal 'reminted-token-abc'; the
    // URL builder prefixes it with the `/review/` path.
    expect(sendArgs.reviewUrl).toContain('/review/reminted-token-abc')
    // Default org (no branding set) carries the FON defaults through.
    expect(sendArgs.brandName).toBe('Five One Nine Marketing')
    expect(sendArgs.brandLogoUrl).toBeNull()
    expect(sendArgs.brandColor).toBeNull()
  })

  it('white-labels the re-round email with the org branding (P2 #21)', async () => {
    primeAmCtx()
    vi.mocked(getOrgBranding).mockResolvedValueOnce({
      name: 'Acme Agency',
      brandLogoUrl: 'https://cdn.example.com/acme.png',
      brandColor: '#123abc',
    })
    vi.mocked(db.magicLink.findUnique).mockResolvedValue({
      id: MAGIC_LINK_ID,
      batchId: BATCH_ID,
      revokedAt: null,
      expiresAt: new Date('2026-12-31T00:00:00Z'),
      defaultReviewerName: 'Jane Client',
      defaultReviewerEmail: 'jane@client.com',
      batch: {
        id: BATCH_ID,
        clientId: CLIENT_ID,
        scheduledAt: new Date('2026-06-01T00:00:00Z'),
        label: 'June 2026',
      },
      creator: { id: 'user_creator', name: 'Caleb', email: 'caleb@fonmarketing.com' },
    } as never)
    vi.mocked(startNextRound).mockResolvedValue({ id: 'session_2', round: 2 } as never)
    vi.mocked(sendMagicLinkEmail).mockResolvedValue({ messageId: 'm_1' } as never)

    await startNextRoundAction({ magicLinkId: MAGIC_LINK_ID })

    const sendArgs = vi.mocked(sendMagicLinkEmail).mock.calls[0][0]
    expect(sendArgs.brandName).toBe('Acme Agency')
    expect(sendArgs.brandLogoUrl).toBe('https://cdn.example.com/acme.png')
    expect(sendArgs.brandColor).toBe('#123abc')
  })
})

// ---- unmarkPostAddressedAction ----

const UNMARK_POST_ID = 'cuid_post_unmark'
const UNMARK_ITEM_ID = 'cuid_item_unmark'
const UNMARK_SESSION_ID = 'cuid_session_unmark'

function primeUnmarkPost(): void {
  vi.mocked(db.post.findUnique).mockResolvedValue({
    id: UNMARK_POST_ID,
    clientId: CLIENT_ID,
    batchId: BATCH_ID,
    caption: 'current caption',
    hashtags: ['#tag'],
    graphicHook: null,
    designerNotes: null,
  } as never)
  vi.mocked(bulkReopenOnPost).mockResolvedValue(3)
}

describe('unmarkPostAddressedAction', () => {
  it('pins-only (no reviewItemId): re-opens client pins, skips reviewItem.update, records review_item_unaddressed with unaccepted:false', async () => {
    primeAmCtx()
    primeUnmarkPost()

    const result = await unmarkPostAddressedAction({
      postId: UNMARK_POST_ID,
      reviewSessionId: UNMARK_SESSION_ID,
    })

    expect(result).toEqual({ ok: true, pinsReopened: 3 })
    // Re-opens ALL resolved client pins on the post, NOT just ones resolved
    // via Mark addressed. In practice client pins get resolved with a null
    // reason (the per-pin Resolve popover), so a reason-scoped re-open would
    // be a no-op and the post would never move back. Must NOT pass
    // resolvedReason.
    expect(bulkReopenOnPost).toHaveBeenCalledWith({
      postId: UNMARK_POST_ID,
      onlyClientPins: true,
    })
    const reopenArg = vi.mocked(bulkReopenOnPost).mock.calls[0][0]
    expect('resolvedReason' in reopenArg).toBe(false)
    expect(db.reviewItem.update).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(recordActivity).toHaveBeenCalledTimes(1)
    const activity = vi.mocked(recordActivity).mock.calls[0][0]
    expect(activity.kind).toBe(ActivityKind.review_item_unaddressed)
    expect(activity.clientId).toBe(CLIENT_ID)
    expect(activity.actorId).toBe(AM_USER_DB_ID)
    expect(activity.payload).toMatchObject({
      postId: UNMARK_POST_ID,
      reviewItemId: null,
      unaccepted: false,
      pinsReopened: 3,
    })
  })

  it('flag path (reviewItemId present, acceptedAsPostVersionId null): calls reviewItem.update to clear addressedAt, records unaccepted:false', async () => {
    primeAmCtx()
    primeUnmarkPost()
    vi.mocked(db.reviewItem.findUnique).mockResolvedValue({
      id: UNMARK_ITEM_ID,
      postId: UNMARK_POST_ID,
      acceptedAsPostVersionId: null,
    } as never)

    const result = await unmarkPostAddressedAction({
      postId: UNMARK_POST_ID,
      reviewItemId: UNMARK_ITEM_ID,
      reviewSessionId: UNMARK_SESSION_ID,
    })

    expect(result).toEqual({ ok: true, pinsReopened: 3 })
    expect(db.reviewItem.update).toHaveBeenCalledWith({
      where: { id: UNMARK_ITEM_ID },
      data: { addressedAt: null, addressedBy: null, noteResolvedAt: null, noteResolvedBy: null },
    })
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(recordActivity).toHaveBeenCalledTimes(1)
    const activity = vi.mocked(recordActivity).mock.calls[0][0]
    expect(activity.payload).toMatchObject({ unaccepted: false })
  })

  it('accept path: un-accepts caption edit — snapshots revert version, runs $transaction, records unaccepted:true', async () => {
    primeAmCtx()
    primeUnmarkPost()
    vi.mocked(db.reviewItem.findUnique).mockResolvedValue({
      id: UNMARK_ITEM_ID,
      postId: UNMARK_POST_ID,
      acceptedAsPostVersionId: 'pv1',
    } as never)
    vi.mocked(db.activityEvent.findFirst).mockResolvedValue({
      payload: { oldCaption: 'OLD caption text' },
    } as never)
    vi.mocked(snapshotPostVersion).mockResolvedValue({ id: 'pvNew' } as never)
    vi.mocked(db.$transaction).mockResolvedValue([{}, {}] as never)

    const result = await unmarkPostAddressedAction({
      postId: UNMARK_POST_ID,
      reviewItemId: UNMARK_ITEM_ID,
      reviewSessionId: UNMARK_SESSION_ID,
    })

    expect(result).toEqual({ ok: true, pinsReopened: 3 })
    expect(snapshotPostVersion).toHaveBeenCalledWith({
      postId: UNMARK_POST_ID,
      authorId: AM_USER_DB_ID,
      body: expect.objectContaining({ caption: 'OLD caption text' }),
    })
    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(recordActivity).toHaveBeenCalledTimes(1)
    const activity = vi.mocked(recordActivity).mock.calls[0][0]
    expect(activity.payload).toMatchObject({ unaccepted: true })
    // The accept-event lookup is scoped to THIS item (not just the post),
    // so un-accepting from an older session reverts to the right round's
    // caption rather than the latest round's.
    const findFirstWhere = vi.mocked(db.activityEvent.findFirst).mock.calls[0][0]?.where
    expect(findFirstWhere).toMatchObject({
      postId: UNMARK_POST_ID,
      payload: { path: ['reviewItemId'], equals: UNMARK_ITEM_ID },
    })
  })

  it('accept path with no accept event: throws without blanking the caption', async () => {
    primeAmCtx()
    primeUnmarkPost()
    vi.mocked(db.reviewItem.findUnique).mockResolvedValue({
      id: UNMARK_ITEM_ID,
      postId: UNMARK_POST_ID,
      acceptedAsPostVersionId: 'pv1',
    } as never)
    vi.mocked(db.activityEvent.findFirst).mockResolvedValue(null)

    await expect(
      unmarkPostAddressedAction({
        postId: UNMARK_POST_ID,
        reviewItemId: UNMARK_ITEM_ID,
        reviewSessionId: UNMARK_SESSION_ID,
      }),
    ).rejects.toThrow(/Cannot un-accept: no prior caption recorded/)

    expect(snapshotPostVersion).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(recordActivity).not.toHaveBeenCalled()
  })

  it('review item not on the post: throws', async () => {
    primeAmCtx()
    primeUnmarkPost()
    vi.mocked(db.reviewItem.findUnique).mockResolvedValue({
      id: UNMARK_ITEM_ID,
      postId: 'some-other-post',
      acceptedAsPostVersionId: null,
    } as never)

    await expect(
      unmarkPostAddressedAction({
        postId: UNMARK_POST_ID,
        reviewItemId: UNMARK_ITEM_ID,
        reviewSessionId: UNMARK_SESSION_ID,
      }),
    ).rejects.toThrow(/does not belong/)

    expect(db.reviewItem.update).not.toHaveBeenCalled()
    expect(recordActivity).not.toHaveBeenCalled()
  })

  it('rejects with RelayCompletedError and does not write the caption when the batch is completed', async () => {
    primeAmCtx()
    primeUnmarkPost()
    vi.mocked(assertBatchEditable).mockRejectedValueOnce(new RelayCompletedError())

    await expect(
      unmarkPostAddressedAction({
        postId: UNMARK_POST_ID,
        reviewSessionId: UNMARK_SESSION_ID,
      }),
    ).rejects.toThrow(RelayCompletedError)

    expect(snapshotPostVersion).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(recordActivity).not.toHaveBeenCalled()
  })
})

describe('resolveNoteAction / unresolveNoteAction', () => {
  const NOTE_POST_ID = 'cuid_post_note'
  const NOTE_ITEM_ID = 'cuid_item_note'
  const NOTE_SESSION_ID = 'cuid_session_note'

  function primeNote(): void {
    primeAmCtx()
    vi.mocked(db.post.findUnique).mockResolvedValue({
      id: NOTE_POST_ID,
      clientId: CLIENT_ID,
      batchId: BATCH_ID,
    } as never)
    vi.mocked(db.reviewItem.findUnique).mockResolvedValue({
      id: NOTE_ITEM_ID,
      postId: NOTE_POST_ID,
    } as never)
  }

  it('stamps noteResolvedAt + noteResolvedBy on the item', async () => {
    primeNote()

    await resolveNoteAction({
      postId: NOTE_POST_ID,
      reviewItemId: NOTE_ITEM_ID,
      reviewSessionId: NOTE_SESSION_ID,
    })

    expect(db.reviewItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: NOTE_ITEM_ID },
        data: { noteResolvedAt: expect.any(Date), noteResolvedBy: AM_USER_DB_ID },
      }),
    )
  })

  it('clears noteResolvedAt + noteResolvedBy on unresolve', async () => {
    primeNote()

    await unresolveNoteAction({
      postId: NOTE_POST_ID,
      reviewItemId: NOTE_ITEM_ID,
      reviewSessionId: NOTE_SESSION_ID,
    })

    expect(db.reviewItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: NOTE_ITEM_ID },
        data: { noteResolvedAt: null, noteResolvedBy: null },
      }),
    )
  })

  it('rejects when the item does not belong to the post', async () => {
    primeNote()
    vi.mocked(db.reviewItem.findUnique).mockResolvedValue({
      id: NOTE_ITEM_ID,
      postId: 'a-different-post',
    } as never)

    await expect(
      resolveNoteAction({
        postId: NOTE_POST_ID,
        reviewItemId: NOTE_ITEM_ID,
        reviewSessionId: NOTE_SESSION_ID,
      }),
    ).rejects.toThrow()
    expect(db.reviewItem.update).not.toHaveBeenCalled()
  })

  it('rejects cross-tenant (findClientForUser returns null)', async () => {
    primeNote()
    vi.mocked(findClientForUser).mockResolvedValue(null as never)

    await expect(
      resolveNoteAction({
        postId: NOTE_POST_ID,
        reviewItemId: NOTE_ITEM_ID,
        reviewSessionId: NOTE_SESSION_ID,
      }),
    ).rejects.toThrow()
    expect(db.reviewItem.update).not.toHaveBeenCalled()
  })

  it('rejects when postId is missing (before any query)', async () => {
    primeNote()

    await expect(
      resolveNoteAction({
        postId: '',
        reviewItemId: NOTE_ITEM_ID,
        reviewSessionId: NOTE_SESSION_ID,
      }),
    ).rejects.toThrow(/postId required/i)
    expect(db.post.findUnique).not.toHaveBeenCalled()
    expect(db.reviewItem.update).not.toHaveBeenCalled()
  })
})

