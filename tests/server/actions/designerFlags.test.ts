// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/server/middleware/permissions', () => ({
  requireClientEditor: vi.fn(),
  requireCan: vi.fn(),
}))

vi.mock('@/lib/relay-holder-override', () => ({
  canOverrideHolder: vi.fn(() => false),
}))

vi.mock('@/server/repositories/clients', () => ({
  findClientForUser: vi.fn(),
}))

vi.mock('@/server/repositories/designerFlags', () => ({
  createDesignerFlag: vi.fn(),
  updateDesignerFlagNote: vi.fn(),
  deleteDesignerFlag: vi.fn(),
  findDesignerFlagForAuth: vi.fn(),
  setDesignerFlagDone: vi.fn(),
}))

vi.mock('@/db/client', () => ({
  db: {
    post: { findUnique: vi.fn() },
    postThread: { findUnique: vi.fn() },
    reviewItem: { findUnique: vi.fn() },
    designerFlag: { findFirst: vi.fn(), findUnique: vi.fn() },
    batch: { findUnique: vi.fn() },
  },
}))

vi.mock('@/server/services/relay', () => ({
  sendFlaggedFeedbackToDesigner: vi.fn(),
}))

import { revalidatePath } from 'next/cache'
import { requireClientEditor, requireCan } from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import {
  createDesignerFlag,
  updateDesignerFlagNote,
  deleteDesignerFlag,
  findDesignerFlagForAuth,
  setDesignerFlagDone,
} from '@/server/repositories/designerFlags'
import { canOverrideHolder } from '@/lib/relay-holder-override'
import { db } from '@/db/client'
import {
  flagFeedbackForDesignerAction,
  unflagFeedbackForDesignerAction,
  sendFlaggedFeedbackToDesignerAction,
  setDesignerFlagDoneAction,
  unsetDesignerFlagDoneAction,
} from '@/server/actions/designerFlags'
import { sendFlaggedFeedbackToDesigner } from '@/server/services/relay'

const AM_USER_DB_ID = 'user_am_1'
const AM_ORG_DB_ID = 'org_db_1'
const CLIENT_ID = 'cuid_client_1'
const BATCH_ID = 'cuid_batch_1'
const POST_ID = 'cuid_post_1'
const THREAD_ID = 'cuid_thread_1'
const REVIEW_ITEM_ID = 'cuid_item_1'
const REVIEW_SESSION_ID = 'cuid_session_1'
const FLAG_ID = 'cuid_flag_1'
const DESIGNER_USER_DB_ID = 'user_designer_1'
const HOLDER_USER_DB_ID = 'user_holder_1'

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
  vi.mocked(setDesignerFlagDone).mockResolvedValue(undefined)
  vi.mocked(canOverrideHolder).mockReturnValue(false)
})

function primeDesignerCtx(userDbId = DESIGNER_USER_DB_ID): void {
  vi.mocked(requireCan).mockResolvedValue({
    userId: 'clerk_designer',
    orgId: 'clerk_org_1',
    role: 'designer',
    plan: 'smb',
    organizationDbId: AM_ORG_DB_ID,
    userDbId,
    platformOwner: false,
    linkedClientId: null,
    permissionOverrides: null,
    roleDefaults: {},
  } as never)
}

function primeHolderCtx(): void {
  vi.mocked(requireCan).mockResolvedValue({
    userId: 'clerk_holder',
    orgId: 'clerk_org_1',
    role: 'account_manager',
    plan: 'smb',
    organizationDbId: AM_ORG_DB_ID,
    userDbId: HOLDER_USER_DB_ID,
    platformOwner: false,
    linkedClientId: null,
    permissionOverrides: null,
    roleDefaults: {},
  } as never)
}

function primeFlagLookup(overrides: { organizationId?: string; assignedDesignerId?: string; currentHolder?: string } = {}): void {
  vi.mocked(db.designerFlag.findUnique).mockResolvedValue({
    id: FLAG_ID,
    batchId: BATCH_ID,
    post: {
      clientId: CLIENT_ID,
      client: {
        organizationId: overrides.organizationId ?? AM_ORG_DB_ID,
        assignedDesignerId: overrides.assignedDesignerId ?? DESIGNER_USER_DB_ID,
      },
    },
    batch: { currentHolder: overrides.currentHolder ?? HOLDER_USER_DB_ID },
  } as never)
}

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

// ---- sendFlaggedFeedbackToDesignerAction ----

describe('sendFlaggedFeedbackToDesignerAction — happy path', () => {
  it('calls sendFlaggedFeedbackToDesigner and revalidates on success', async () => {
    primeAmCtx()
    vi.mocked(db.batch.findUnique).mockResolvedValue({
      clientId: CLIENT_ID,
      client: { organizationId: AM_ORG_DB_ID },
    } as never)
    vi.mocked(sendFlaggedFeedbackToDesigner).mockResolvedValue({
      batchId: BATCH_ID,
      subState: 'awaiting_design_revisions',
      count: 3,
    })

    const result = await sendFlaggedFeedbackToDesignerAction({
      batchId: BATCH_ID,
      reviewSessionId: REVIEW_SESSION_ID,
    })

    expect(result).toEqual({ ok: true, count: 3 })
    expect(sendFlaggedFeedbackToDesigner).toHaveBeenCalledWith({
      batchId: BATCH_ID,
      actorId: AM_USER_DB_ID,
      actorOrganizationId: AM_ORG_DB_ID,
    })
    expect(revalidatePath).toHaveBeenCalled()
  })
})

describe('sendFlaggedFeedbackToDesignerAction — cross-org guard', () => {
  it('throws Relay not found when batch belongs to a different org', async () => {
    primeAmCtx()
    vi.mocked(db.batch.findUnique).mockResolvedValue({
      clientId: CLIENT_ID,
      client: { organizationId: 'other_org_id' },
    } as never)

    await expect(
      sendFlaggedFeedbackToDesignerAction({
        batchId: BATCH_ID,
        reviewSessionId: REVIEW_SESSION_ID,
      }),
    ).rejects.toThrow('Relay not found')

    expect(sendFlaggedFeedbackToDesigner).not.toHaveBeenCalled()
  })

  it('throws Relay not found when batch is null', async () => {
    primeAmCtx()
    vi.mocked(db.batch.findUnique).mockResolvedValue(null)

    await expect(
      sendFlaggedFeedbackToDesignerAction({
        batchId: BATCH_ID,
        reviewSessionId: REVIEW_SESSION_ID,
      }),
    ).rejects.toThrow('Relay not found')

    expect(sendFlaggedFeedbackToDesigner).not.toHaveBeenCalled()
  })
})

// ---- setDesignerFlagDoneAction / unsetDesignerFlagDoneAction ----

describe('setDesignerFlagDoneAction — guard: requireCan relay.pass', () => {
  it('calls requireCan with relay.pass before any other work', async () => {
    primeDesignerCtx()
    primeFlagLookup()

    await setDesignerFlagDoneAction({ flagId: FLAG_ID, reviewSessionId: REVIEW_SESSION_ID })

    expect(requireCan).toHaveBeenCalledWith('relay.pass')
  })
})

describe('setDesignerFlagDoneAction — happy path: assigned designer', () => {
  it('calls setDesignerFlagDone with done=true when caller is the assigned designer', async () => {
    primeDesignerCtx(DESIGNER_USER_DB_ID)
    primeFlagLookup({ assignedDesignerId: DESIGNER_USER_DB_ID })

    const result = await setDesignerFlagDoneAction({ flagId: FLAG_ID, reviewSessionId: REVIEW_SESSION_ID })

    expect(result).toEqual({ ok: true })
    expect(setDesignerFlagDone).toHaveBeenCalledWith(FLAG_ID, DESIGNER_USER_DB_ID, true)
    expect(revalidatePath).toHaveBeenCalled()
  })
})

describe('unsetDesignerFlagDoneAction — happy path: assigned designer', () => {
  it('calls setDesignerFlagDone with done=false when caller is the assigned designer', async () => {
    primeDesignerCtx(DESIGNER_USER_DB_ID)
    primeFlagLookup({ assignedDesignerId: DESIGNER_USER_DB_ID })

    const result = await unsetDesignerFlagDoneAction({ flagId: FLAG_ID, reviewSessionId: REVIEW_SESSION_ID })

    expect(result).toEqual({ ok: true })
    expect(setDesignerFlagDone).toHaveBeenCalledWith(FLAG_ID, DESIGNER_USER_DB_ID, false)
  })
})

describe('setDesignerFlagDoneAction — happy path: current holder', () => {
  it('calls setDesignerFlagDone with done=true when caller is the current batch holder', async () => {
    primeHolderCtx()
    primeFlagLookup({
      assignedDesignerId: DESIGNER_USER_DB_ID,
      currentHolder: HOLDER_USER_DB_ID,
    })

    const result = await setDesignerFlagDoneAction({ flagId: FLAG_ID, reviewSessionId: REVIEW_SESSION_ID })

    expect(result).toEqual({ ok: true })
    expect(setDesignerFlagDone).toHaveBeenCalledWith(FLAG_ID, HOLDER_USER_DB_ID, true)
  })
})

describe('setDesignerFlagDoneAction — authz: denied when neither designer nor holder nor override', () => {
  it('throws the guard message when caller is unrelated', async () => {
    primeDesignerCtx('user_unrelated')
    primeFlagLookup({
      assignedDesignerId: DESIGNER_USER_DB_ID,
      currentHolder: HOLDER_USER_DB_ID,
    })
    vi.mocked(canOverrideHolder).mockReturnValue(false)

    await expect(
      setDesignerFlagDoneAction({ flagId: FLAG_ID, reviewSessionId: REVIEW_SESSION_ID }),
    ).rejects.toThrow('Only the assigned designer, an AM, or an admin can update this task.')

    expect(setDesignerFlagDone).not.toHaveBeenCalled()
  })
})

describe('setDesignerFlagDoneAction — cross-org guard', () => {
  it('throws Flag not found when the flag belongs to a different org', async () => {
    primeDesignerCtx()
    primeFlagLookup({ organizationId: 'other_org_id' })

    await expect(
      setDesignerFlagDoneAction({ flagId: FLAG_ID, reviewSessionId: REVIEW_SESSION_ID }),
    ).rejects.toThrow('Flag not found')

    expect(setDesignerFlagDone).not.toHaveBeenCalled()
  })

  it('throws Flag not found when designerFlag.findUnique returns null', async () => {
    primeDesignerCtx()
    vi.mocked(db.designerFlag.findUnique).mockResolvedValue(null)

    await expect(
      setDesignerFlagDoneAction({ flagId: FLAG_ID, reviewSessionId: REVIEW_SESSION_ID }),
    ).rejects.toThrow('Flag not found')

    expect(setDesignerFlagDone).not.toHaveBeenCalled()
  })
})
