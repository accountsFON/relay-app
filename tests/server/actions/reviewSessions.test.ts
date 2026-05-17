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
}))

vi.mock('@/server/repositories/magicLinks', () => ({
  findByTokenHash: vi.fn(),
}))

vi.mock('@/server/repositories/reviewSessions', () => ({
  findActiveSession: vi.fn(),
  findSessionWithItems: vi.fn(),
  saveDraftItem: vi.fn(),
  startSession: vi.fn(),
  submitSession: vi.fn(),
}))

vi.mock('@/server/services/activity', async () => {
  const actual = await vi.importActual<typeof import('@prisma/client')>('@prisma/client')
  return {
    recordActivity: vi.fn(),
    ActivityKind: actual.ActivityKind,
    EventVisibility: actual.EventVisibility,
  }
})

vi.mock('@/lib/resend', () => ({
  sendEmail: vi.fn(),
}))

vi.mock('@/db/client', () => ({
  db: {
    magicLinkReviewer: { findUnique: vi.fn() },
    magicLink: { findUnique: vi.fn() },
    post: { findMany: vi.fn() },
  },
}))

import { cookies } from 'next/headers'
import { verifyToken, verifySession } from '@/lib/magic-link'
import { findByTokenHash } from '@/server/repositories/magicLinks'
import {
  findActiveSession,
  findSessionWithItems,
  submitSession,
} from '@/server/repositories/reviewSessions'
import { recordActivity, ActivityKind } from '@/server/services/activity'
import { sendEmail } from '@/lib/resend'
import { db } from '@/db/client'
import { submitSessionAction } from '@/server/actions/reviewSessions'

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
})

describe('submitSessionAction', () => {
  it('happy path: flips status, sends digest, emits activity, returns summary', async () => {
    primeReviewerResolve()
    vi.mocked(findActiveSession).mockResolvedValue({
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

  it('throws when the active session has no items, and does NOT submit or send', async () => {
    primeReviewerResolve()
    vi.mocked(findActiveSession).mockResolvedValue({
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

  it('email failure does NOT roll back the submission , status still flipped, returns emailError', async () => {
    primeReviewerResolve()
    vi.mocked(findActiveSession).mockResolvedValue({
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
})
