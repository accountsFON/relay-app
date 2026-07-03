// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/server/middleware/permissions', () => ({
  requireClientEditor: vi.fn(),
}))

vi.mock('@/server/repositories/clients', () => ({
  findClientForUser: vi.fn(),
}))

vi.mock('@/server/repositories/designerFlags', () => ({
  createDesignerFlag: vi.fn(),
  updateDesignerFlagNote: vi.fn(),
  deleteDesignerFlag: vi.fn(),
  findDesignerFlagForAuth: vi.fn(),
}))

vi.mock('@/db/client', () => ({
  db: {
    post: { findUnique: vi.fn() },
    postThread: { findUnique: vi.fn() },
    reviewItem: { findUnique: vi.fn() },
    designerFlag: { findFirst: vi.fn() },
  },
}))

import { revalidatePath } from 'next/cache'
import { requireClientEditor } from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import {
  createDesignerFlag,
  updateDesignerFlagNote,
  deleteDesignerFlag,
  findDesignerFlagForAuth,
} from '@/server/repositories/designerFlags'
import { db } from '@/db/client'
import {
  flagFeedbackForDesignerAction,
  unflagFeedbackForDesignerAction,
} from '@/server/actions/designerFlags'

const AM_USER_DB_ID = 'user_am_1'
const AM_ORG_DB_ID = 'org_db_1'
const CLIENT_ID = 'cuid_client_1'
const BATCH_ID = 'cuid_batch_1'
const POST_ID = 'cuid_post_1'
const THREAD_ID = 'cuid_thread_1'
const REVIEW_ITEM_ID = 'cuid_item_1'
const REVIEW_SESSION_ID = 'cuid_session_1'
const FLAG_ID = 'cuid_flag_1'

function primeAmCtx(): void {
  vi.mocked(requireClientEditor).mockResolvedValue({
    userId: 'clerk_user_am',
    orgId: 'clerk_org_1',
    role: 'account_manager',
    plan: 'smb',
    organizationDbId: AM_ORG_DB_ID,
    userDbId: AM_USER_DB_ID,
    platformOwner: false,
    linkedClientId: null,
    permissionOverrides: null,
    roleDefaults: {},
  } as never)
  vi.mocked(findClientForUser).mockResolvedValue({
    id: CLIENT_ID,
    name: 'Test Client',
  } as never)
}

function primePost(): void {
  vi.mocked(db.post.findUnique).mockResolvedValue({
    id: POST_ID,
    clientId: CLIENT_ID,
    batchId: BATCH_ID,
  } as never)
}

function primeThread(overrides: { postId?: string } = {}): void {
  vi.mocked(db.postThread.findUnique).mockResolvedValue({
    id: THREAD_ID,
    postId: overrides.postId ?? POST_ID,
  } as never)
}

function primeReviewItem(overrides: { postId?: string } = {}): void {
  vi.mocked(db.reviewItem.findUnique).mockResolvedValue({
    id: REVIEW_ITEM_ID,
    postId: overrides.postId ?? POST_ID,
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.designerFlag.findFirst).mockResolvedValue(null)
  vi.mocked(createDesignerFlag).mockResolvedValue({ id: FLAG_ID })
  vi.mocked(updateDesignerFlagNote).mockResolvedValue(undefined)
  vi.mocked(deleteDesignerFlag).mockResolvedValue(undefined)
})

// ---- flagFeedbackForDesignerAction ----

describe('flagFeedbackForDesignerAction — happy path with threadId', () => {
  it('calls createDesignerFlag with the correct payload when flagging by thread', async () => {
    primeAmCtx()
    primePost()
    primeThread()

    const result = await flagFeedbackForDesignerAction({
      postId: POST_ID,
      reviewSessionId: REVIEW_SESSION_ID,
      threadId: THREAD_ID,
      note: 'please fix the colours',
    })

    expect(result).toEqual({ ok: true, flagId: FLAG_ID })
    expect(createDesignerFlag).toHaveBeenCalledWith({
      batchId: BATCH_ID,
      postId: POST_ID,
      threadId: THREAD_ID,
      reviewItemId: null,
      note: 'please fix the colours',
      createdById: AM_USER_DB_ID,
    })
    expect(updateDesignerFlagNote).not.toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalled()
  })
})

describe('flagFeedbackForDesignerAction — happy path with reviewItemId', () => {
  it('calls createDesignerFlag with the correct payload when flagging by reviewItem', async () => {
    primeAmCtx()
    primePost()
    primeReviewItem()

    const result = await flagFeedbackForDesignerAction({
      postId: POST_ID,
      reviewSessionId: REVIEW_SESSION_ID,
      reviewItemId: REVIEW_ITEM_ID,
    })

    expect(result).toEqual({ ok: true, flagId: FLAG_ID })
    expect(createDesignerFlag).toHaveBeenCalledWith({
      batchId: BATCH_ID,
      postId: POST_ID,
      threadId: null,
      reviewItemId: REVIEW_ITEM_ID,
      note: null,
      createdById: AM_USER_DB_ID,
    })
  })
})

describe('flagFeedbackForDesignerAction — input validation', () => {
  it('throws when neither threadId nor reviewItemId is provided', async () => {
    primeAmCtx()
    primePost()

    await expect(
      flagFeedbackForDesignerAction({
        postId: POST_ID,
        reviewSessionId: REVIEW_SESSION_ID,
      }),
    ).rejects.toThrow('Exactly one of threadId or reviewItemId is required')
  })

  it('throws when both threadId and reviewItemId are provided', async () => {
    primeAmCtx()
    primePost()

    await expect(
      flagFeedbackForDesignerAction({
        postId: POST_ID,
        reviewSessionId: REVIEW_SESSION_ID,
        threadId: THREAD_ID,
        reviewItemId: REVIEW_ITEM_ID,
      }),
    ).rejects.toThrow('Exactly one of threadId or reviewItemId is required')
  })
})

describe('flagFeedbackForDesignerAction — cross-org guard', () => {
  it('throws Post not found when findClientForUser returns null', async () => {
    primeAmCtx()
    primePost()
    vi.mocked(findClientForUser).mockResolvedValue(null)

    await expect(
      flagFeedbackForDesignerAction({
        postId: POST_ID,
        reviewSessionId: REVIEW_SESSION_ID,
        threadId: THREAD_ID,
      }),
    ).rejects.toThrow('Post not found')

    expect(createDesignerFlag).not.toHaveBeenCalled()
  })
})

describe('flagFeedbackForDesignerAction — item-belongs-to-post guards', () => {
  it('throws when the thread does not belong to the post', async () => {
    primeAmCtx()
    primePost()
    primeThread({ postId: 'other_post_id' })

    await expect(
      flagFeedbackForDesignerAction({
        postId: POST_ID,
        reviewSessionId: REVIEW_SESSION_ID,
        threadId: THREAD_ID,
      }),
    ).rejects.toThrow('Thread does not belong to this post')

    expect(createDesignerFlag).not.toHaveBeenCalled()
  })

  it('throws when the reviewItem does not belong to the post', async () => {
    primeAmCtx()
    primePost()
    primeReviewItem({ postId: 'other_post_id' })

    await expect(
      flagFeedbackForDesignerAction({
        postId: POST_ID,
        reviewSessionId: REVIEW_SESSION_ID,
        reviewItemId: REVIEW_ITEM_ID,
      }),
    ).rejects.toThrow('Review item does not belong to this post')

    expect(createDesignerFlag).not.toHaveBeenCalled()
  })
})

describe('flagFeedbackForDesignerAction — upsert behaviour', () => {
  it('calls updateDesignerFlagNote instead of createDesignerFlag when a flag already exists', async () => {
    primeAmCtx()
    primePost()
    primeThread()
    vi.mocked(db.designerFlag.findFirst).mockResolvedValue({ id: FLAG_ID } as never)

    const result = await flagFeedbackForDesignerAction({
      postId: POST_ID,
      reviewSessionId: REVIEW_SESSION_ID,
      threadId: THREAD_ID,
      note: 'updated note',
    })

    expect(result).toEqual({ ok: true, flagId: FLAG_ID })
    expect(createDesignerFlag).not.toHaveBeenCalled()
    expect(updateDesignerFlagNote).toHaveBeenCalledWith(FLAG_ID, 'updated note')
  })
})

// ---- unflagFeedbackForDesignerAction ----

describe('unflagFeedbackForDesignerAction — happy path', () => {
  it('deletes the flag when the org matches', async () => {
    primeAmCtx()
    vi.mocked(findDesignerFlagForAuth).mockResolvedValue({
      id: FLAG_ID,
      batchId: BATCH_ID,
      postId: POST_ID,
      post: {
        clientId: CLIENT_ID,
        client: { organizationId: AM_ORG_DB_ID },
      },
    } as never)

    const result = await unflagFeedbackForDesignerAction({
      flagId: FLAG_ID,
      reviewSessionId: REVIEW_SESSION_ID,
    })

    expect(result).toEqual({ ok: true })
    expect(deleteDesignerFlag).toHaveBeenCalledWith(FLAG_ID)
    expect(revalidatePath).toHaveBeenCalled()
  })
})

describe('unflagFeedbackForDesignerAction — cross-org guard', () => {
  it('throws Flag not found when the flag belongs to a different org', async () => {
    primeAmCtx()
    vi.mocked(findDesignerFlagForAuth).mockResolvedValue({
      id: FLAG_ID,
      batchId: BATCH_ID,
      postId: POST_ID,
      post: {
        clientId: CLIENT_ID,
        client: { organizationId: 'other_org_id' },
      },
    } as never)

    await expect(
      unflagFeedbackForDesignerAction({
        flagId: FLAG_ID,
        reviewSessionId: REVIEW_SESSION_ID,
      }),
    ).rejects.toThrow('Flag not found')

    expect(deleteDesignerFlag).not.toHaveBeenCalled()
  })

  it('throws Flag not found when findDesignerFlagForAuth returns null', async () => {
    primeAmCtx()
    vi.mocked(findDesignerFlagForAuth).mockResolvedValue(null)

    await expect(
      unflagFeedbackForDesignerAction({
        flagId: FLAG_ID,
        reviewSessionId: REVIEW_SESSION_ID,
      }),
    ).rejects.toThrow('Flag not found')

    expect(deleteDesignerFlag).not.toHaveBeenCalled()
  })
})
