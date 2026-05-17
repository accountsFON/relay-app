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

vi.mock('@/lib/resend', () => ({
  sendEmail: vi.fn(),
}))

vi.mock('@/db/client', () => ({
  db: {
    magicLinkReviewer: { findUnique: vi.fn() },
    magicLink: { findUnique: vi.fn() },
    post: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    reviewItem: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
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
import { startNextRound } from '@/server/services/reviewRound'
import { snapshotPostVersion } from '@/server/services/postVersions'
import { sendMagicLinkEmail } from '@/server/services/sendMagicLinkEmail'
import { requireClientEditor } from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import {
  acceptCaptionEditAction,
  addressItemAction,
  rejectCaptionEditAction,
  startNextRoundAction,
  submitSessionAction,
} from '@/server/actions/reviewSessions'

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
      magicLink: {
        id: MAGIC_LINK_ID,
        batchId: BATCH_ID,
        batch: { id: BATCH_ID, clientId: CLIENT_ID },
      },
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

  it('throws when the item is approved or not_reviewed', async () => {
    primeAmCtx()
    primeAmReviewItem({ decision: 'approved' })

    await expect(
      addressItemAction({ reviewItemId: REVIEW_ITEM_ID }),
    ).rejects.toThrow(/Cannot mark a approved item as addressed/)

    expect(recordActivity).not.toHaveBeenCalled()
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
  })
})
