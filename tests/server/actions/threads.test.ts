// @vitest-environment node
/**
 * Unit tests for createThreadAction, addCommentAction, and
 * useCommentImageAsPostMediaAction.
 *
 * Coverage:
 *   - image attachment is passed through to the repo when valid
 *   - text-only (no image) works unchanged
 *   - empty body + no image → throws "Comment requires text or an image"
 *   - image URL that is NOT a comment-image blob URL → throws "Invalid attachment URL"
 *     (repo is NOT called in that case)
 *   - useCommentImageAsPostMediaAction: permission gate, cross-tenant guard,
 *     missing imageUrl guard, calls attachMediaToPost + revalidate on success
 *
 * Auth layer (resolveActor) is mocked via its two dependencies so tests don't
 * need a real Clerk session or magic-link cookie.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- mock auth deps ---
vi.mock('@/server/middleware/auth', () => ({
  getOrgContext: vi.fn(),
  requireOrgContext: vi.fn(),
}))

vi.mock('@/server/auth/magic-link-reviewer', () => ({
  getMagicLinkReviewerFromCookie: vi.fn(),
}))

// --- mock permissions middleware (requireCan used by useCommentImageAsPostMediaAction) ---
vi.mock('@/server/middleware/permissions', () => ({
  requireCan: vi.fn(),
}))

// --- mock repo ---
vi.mock('@/server/repositories/threads', () => ({
  createThread: vi.fn(),
  addComment: vi.fn(),
  bulkResolveOnPost: vi.fn(),
  listThreadsForPost: vi.fn(),
  listThreadsForBatch: vi.fn(),
  reopenThread: vi.fn(),
  resolveThread: vi.fn(),
}))

// --- mock next/cache so revalidatePath is a no-op ---
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// --- mock db for the revalidate helpers and comment lookup ---
vi.mock('@/db/client', () => ({
  db: {
    post: { findUnique: vi.fn() },
    postThread: { findUnique: vi.fn() },
    postComment: { findUnique: vi.fn() },
  },
}))

// --- mock attachMediaToPost ---
vi.mock('@/lib/media', () => ({
  attachMediaToPost: vi.fn(),
}))

// --- mock promotePostFeedbackToThread (Task 3) ---
vi.mock('@/server/lib/promotePostFeedback', () => ({
  promotePostFeedbackToThread: vi.fn(),
}))

// --- mock notifyClientOfAmReply (Task 4) ---
vi.mock('@/server/lib/notifyClientOfAmReply', () => ({ notifyClientOfAmReply: vi.fn() }))

// --- mock internal-review notify helpers (internal review notifications) ---
vi.mock('@/server/lib/notifyInternalThreadReply', () => ({ notifyInternalThreadReply: vi.fn() }))
vi.mock('@/server/lib/internalMentionRoster', () => ({ internalMentionRosterForClient: vi.fn() }))

import { getOrgContext } from '@/server/middleware/auth'
import { getMagicLinkReviewerFromCookie } from '@/server/auth/magic-link-reviewer'
import { requireCan } from '@/server/middleware/permissions'
import { createThread, addComment } from '@/server/repositories/threads'
import { db } from '@/db/client'
import { attachMediaToPost } from '@/lib/media'
import { promotePostFeedbackToThread } from '@/server/lib/promotePostFeedback'
import { notifyClientOfAmReply } from '@/server/lib/notifyClientOfAmReply'
import { notifyInternalThreadReply } from '@/server/lib/notifyInternalThreadReply'
import { internalMentionRosterForClient } from '@/server/lib/internalMentionRoster'
import {
  createThreadAction,
  addCommentAction,
  useCommentImageAsPostMediaAction,
  replyToPostFeedbackAction,
} from '@/server/actions/threads'

// A valid comment-image blob URL (the stub hostname matches the guard)
const VALID_IMAGE_URL = 'https://abc.vercel-storage.test/comment-images/am/user1/img.png'
const INVALID_IMAGE_URL = 'https://example.com/image.png'

const THREAD_RESULT = {
  threadId: 'thread_1',
  postId: 'post_1',
  status: 'open' as const,
  pin: { kind: 'post' as const },
  firstComment: {
    id: 'comment_1',
    author: { kind: 'am' as const, userId: 'user_1', name: 'Test User', avatarUrl: null },
    body: 'Hello',
    createdAt: new Date('2026-06-22T12:00:00Z'),
    imageUrl: null,
    imageWidth: null,
    imageHeight: null,
  },
}

const COMMENT_RESULT = {
  id: 'comment_2',
  threadId: 'thread_1',
  author: { kind: 'am' as const, userId: 'user_1', name: 'Test User', avatarUrl: null },
  body: 'A reply',
  createdAt: new Date('2026-06-22T12:01:00Z'),
  imageUrl: null,
  imageWidth: null,
  imageHeight: null,
}

const AM_CTX = {
  userId: 'clerk_user',
  orgId: 'clerk_org',
  role: 'am',
  plan: 'agency',
  organizationDbId: 'org_1',
  userDbId: 'user_1',
  avatarUrl: null,
  platformOwner: false,
  linkedClientId: null,
  permissionOverrides: null,
  roleDefaults: {},
} as const

beforeEach(() => {
  vi.clearAllMocks()

  // Default: AM actor
  vi.mocked(getOrgContext).mockResolvedValue(AM_CTX as never)
  vi.mocked(getMagicLinkReviewerFromCookie).mockResolvedValue(null)

  // requireCan happy path: returns AM ctx
  vi.mocked(requireCan).mockResolvedValue(AM_CTX as never)

  // Repo happy path
  vi.mocked(createThread).mockResolvedValue(THREAD_RESULT)
  vi.mocked(addComment).mockResolvedValue(COMMENT_RESULT)

  // attachMediaToPost no-op
  vi.mocked(attachMediaToPost).mockResolvedValue(undefined as never)

  // Revalidate path helpers
  vi.mocked(db.post.findUnique).mockResolvedValue({
    clientId: 'client_1',
    batchId: 'batch_1',
  } as never)
  vi.mocked(db.postThread.findUnique).mockResolvedValue({
    postId: 'post_1',
    post: { clientId: 'client_1' },
  } as never)

  // Internal-review roster default: empty (no roster members).
  vi.mocked(internalMentionRosterForClient).mockResolvedValue([])

  // postComment findUnique: default happy-path comment with a valid imageUrl
  vi.mocked(db.postComment.findUnique).mockResolvedValue({
    imageUrl: VALID_IMAGE_URL,
    thread: {
      post: {
        id: 'post_1',
        clientId: 'client_1',
        client: { organizationId: 'org_1' },
      },
    },
  } as never)
})

// ---------------------------------------------------------------------------
// createThreadAction
// ---------------------------------------------------------------------------

describe('createThreadAction', () => {
  it('passes imageUrl + dims to createThread when a valid image is provided', async () => {
    await createThreadAction({
      postId: 'post_1',
      pin: { kind: 'post' },
      body: 'Hello',
      image: { url: VALID_IMAGE_URL, width: 800, height: 600 },
    })

    expect(createThread).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: VALID_IMAGE_URL,
        imageWidth: 800,
        imageHeight: 600,
      }),
    )
  })

  it('works text-only with no image (imageUrl persisted as null)', async () => {
    await createThreadAction({
      postId: 'post_1',
      pin: { kind: 'post' },
      body: 'Hello',
    })

    expect(createThread).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: null,
        imageWidth: null,
        imageHeight: null,
      }),
    )
  })

  it('throws "Comment requires text or an image" when body is empty and no image', async () => {
    await expect(
      createThreadAction({
        postId: 'post_1',
        pin: { kind: 'post' },
        body: '   ',
      }),
    ).rejects.toThrow('Comment requires text or an image')

    expect(createThread).not.toHaveBeenCalled()
  })

  it('throws "Invalid attachment URL" and does NOT call repo when url is not a blob url', async () => {
    await expect(
      createThreadAction({
        postId: 'post_1',
        pin: { kind: 'post' },
        body: 'Hello',
        image: { url: INVALID_IMAGE_URL },
      }),
    ).rejects.toThrow('Invalid attachment URL')

    expect(createThread).not.toHaveBeenCalled()
  })

  it('allows empty body when a valid image is provided', async () => {
    await createThreadAction({
      postId: 'post_1',
      pin: { kind: 'post' },
      body: '',
      image: { url: VALID_IMAGE_URL },
    })

    expect(createThread).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: VALID_IMAGE_URL,
        imageWidth: null,
        imageHeight: null,
      }),
    )
  })

  it('resolves @mentions server-side from the body + roster and passes mentionedUserIds to createThread', async () => {
    vi.mocked(db.post.findUnique).mockResolvedValue({
      clientId: 'client_1',
      batchId: 'batch_1',
    } as never)
    vi.mocked(internalMentionRosterForClient).mockResolvedValue([
      { id: 'u_des', name: 'Dan Designer', handle: 'dan.designer' },
    ])

    await createThreadAction({
      postId: 'post_1',
      pin: { kind: 'post' },
      body: 'pinging @dan.designer here',
    })

    expect(internalMentionRosterForClient).toHaveBeenCalledWith('client_1')
    expect(createThread).toHaveBeenCalledWith(
      expect.objectContaining({ mentionedUserIds: ['u_des'] }),
    )
  })
})

// ---------------------------------------------------------------------------
// addCommentAction
// ---------------------------------------------------------------------------

describe('addCommentAction', () => {
  it('passes imageUrl + dims to addComment when a valid image is provided', async () => {
    await addCommentAction({
      threadId: 'thread_1',
      body: 'A reply',
      image: { url: VALID_IMAGE_URL, width: 1024, height: 768 },
    })

    expect(addComment).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: VALID_IMAGE_URL,
        imageWidth: 1024,
        imageHeight: 768,
      }),
    )
  })

  it('works text-only with no image (imageUrl persisted as null)', async () => {
    await addCommentAction({
      threadId: 'thread_1',
      body: 'A reply',
    })

    expect(addComment).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: null,
        imageWidth: null,
        imageHeight: null,
      }),
    )
  })

  it('throws "Comment requires text or an image" when body is empty and no image', async () => {
    await expect(
      addCommentAction({
        threadId: 'thread_1',
        body: '',
      }),
    ).rejects.toThrow('Comment requires text or an image')

    expect(addComment).not.toHaveBeenCalled()
  })

  it('throws "Invalid attachment URL" and does NOT call repo when url is not a blob url', async () => {
    await expect(
      addCommentAction({
        threadId: 'thread_1',
        body: 'A reply',
        image: { url: INVALID_IMAGE_URL },
      }),
    ).rejects.toThrow('Invalid attachment URL')

    expect(addComment).not.toHaveBeenCalled()
  })

  it('allows empty body when a valid image is provided', async () => {
    await addCommentAction({
      threadId: 'thread_1',
      body: '  ',
      image: { url: VALID_IMAGE_URL, width: 200, height: 100 },
    })

    expect(addComment).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: VALID_IMAGE_URL,
        imageWidth: 200,
        imageHeight: 100,
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// useCommentImageAsPostMediaAction
// ---------------------------------------------------------------------------

describe('useCommentImageAsPostMediaAction', () => {
  it('calls requireCan("post.media.edit") before anything else', async () => {
    await useCommentImageAsPostMediaAction({ postId: 'post_1', commentId: 'comment_1' })

    expect(requireCan).toHaveBeenCalledWith('post.media.edit')
  })

  it('loads the comment with its thread→post→client relation', async () => {
    await useCommentImageAsPostMediaAction({ postId: 'post_1', commentId: 'comment_1' })

    expect(db.postComment.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'comment_1' },
      }),
    )
  })

  it('throws "Not found" when post.id does not match input.postId', async () => {
    vi.mocked(db.postComment.findUnique).mockResolvedValue({
      imageUrl: VALID_IMAGE_URL,
      thread: {
        post: {
          id: 'post_OTHER',
          clientId: 'client_1',
          client: { organizationId: 'org_1' },
        },
      },
    } as never)

    await expect(
      useCommentImageAsPostMediaAction({ postId: 'post_1', commentId: 'comment_1' }),
    ).rejects.toThrow('Not found')

    expect(attachMediaToPost).not.toHaveBeenCalled()
  })

  it('throws "Not found" when comment belongs to a different org (cross-tenant guard)', async () => {
    vi.mocked(db.postComment.findUnique).mockResolvedValue({
      imageUrl: VALID_IMAGE_URL,
      thread: {
        post: {
          id: 'post_1',
          clientId: 'client_other',
          client: { organizationId: 'org_OTHER' },
        },
      },
    } as never)

    await expect(
      useCommentImageAsPostMediaAction({ postId: 'post_1', commentId: 'comment_1' }),
    ).rejects.toThrow('Not found')

    expect(attachMediaToPost).not.toHaveBeenCalled()
  })

  it('allows platformOwner to bypass the org guard', async () => {
    vi.mocked(requireCan).mockResolvedValue({ ...AM_CTX, platformOwner: true } as never)
    vi.mocked(db.postComment.findUnique).mockResolvedValue({
      imageUrl: VALID_IMAGE_URL,
      thread: {
        post: {
          id: 'post_1',
          clientId: 'client_other',
          client: { organizationId: 'org_OTHER' },
        },
      },
    } as never)

    await expect(
      useCommentImageAsPostMediaAction({ postId: 'post_1', commentId: 'comment_1' }),
    ).resolves.not.toThrow()

    expect(attachMediaToPost).toHaveBeenCalled()
  })

  it('throws "Comment has no usable image" when comment.imageUrl is null', async () => {
    vi.mocked(db.postComment.findUnique).mockResolvedValue({
      imageUrl: null,
      thread: {
        post: {
          id: 'post_1',
          clientId: 'client_1',
          client: { organizationId: 'org_1' },
        },
      },
    } as never)

    await expect(
      useCommentImageAsPostMediaAction({ postId: 'post_1', commentId: 'comment_1' }),
    ).rejects.toThrow('Comment has no usable image')

    expect(attachMediaToPost).not.toHaveBeenCalled()
  })

  it('throws "Comment has no usable image" when imageUrl is not a comment-image blob URL', async () => {
    vi.mocked(db.postComment.findUnique).mockResolvedValue({
      imageUrl: INVALID_IMAGE_URL,
      thread: {
        post: {
          id: 'post_1',
          clientId: 'client_1',
          client: { organizationId: 'org_1' },
        },
      },
    } as never)

    await expect(
      useCommentImageAsPostMediaAction({ postId: 'post_1', commentId: 'comment_1' }),
    ).rejects.toThrow('Comment has no usable image')

    expect(attachMediaToPost).not.toHaveBeenCalled()
  })

  it('calls attachMediaToPost with postId and comment.imageUrl on success', async () => {
    await useCommentImageAsPostMediaAction({ postId: 'post_1', commentId: 'comment_1' })

    expect(attachMediaToPost).toHaveBeenCalledWith({
      postId: 'post_1',
      url: VALID_IMAGE_URL,
    })
  })

  it('calls revalidatePathForPost (via db.post.findUnique) after successful attach', async () => {
    await useCommentImageAsPostMediaAction({ postId: 'post_1', commentId: 'comment_1' })

    // revalidatePathForPost does a db.post.findUnique to find clientId + batchId
    expect(db.post.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'post_1' } }),
    )
  })

  it('does NOT call resolveThread (no auto-resolve on use-as-post-image)', async () => {
    const { resolveThread } = await import('@/server/repositories/threads')
    await useCommentImageAsPostMediaAction({ postId: 'post_1', commentId: 'comment_1' })

    expect(resolveThread).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// replyToPostFeedbackAction
// ---------------------------------------------------------------------------

describe('replyToPostFeedbackAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(promotePostFeedbackToThread).mockResolvedValue({ threadId: 't1' })
    vi.mocked(db.postThread.findUnique).mockResolvedValue(null as never)
  })

  it('forwards to the service with the authenticated AM user id', async () => {
    vi.mocked(getOrgContext).mockResolvedValue({ userDbId: 'u_am' } as never)
    await replyToPostFeedbackAction({ reviewItemId: 'ri1', body: 'Hello' })
    expect(promotePostFeedbackToThread).toHaveBeenCalledWith({
      reviewItemId: 'ri1',
      amUserId: 'u_am',
      body: 'Hello',
      imageUrl: null,
      imageWidth: null,
      imageHeight: null,
    })
  })

  it('throws when there is no Clerk session (AM-only)', async () => {
    vi.mocked(getOrgContext).mockResolvedValue(null as never)
    await expect(replyToPostFeedbackAction({ reviewItemId: 'ri1', body: 'Hi' })).rejects.toThrow()
    expect(promotePostFeedbackToThread).not.toHaveBeenCalled()
  })

  it('throws on empty body with no image and does not call the service', async () => {
    vi.mocked(getOrgContext).mockResolvedValue({ userDbId: 'u_am' } as never)
    await expect(replyToPostFeedbackAction({ reviewItemId: 'ri1', body: '   ' })).rejects.toThrow(
      'Comment requires text or an image',
    )
    expect(promotePostFeedbackToThread).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// AM reply notifies the client
// ---------------------------------------------------------------------------

describe('AM reply notifies the client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(db.postThread.findUnique).mockResolvedValue(null as never) // revalidate helper no-op
  })

  it('replyToPostFeedbackAction notifies with the promoted thread id', async () => {
    vi.mocked(getOrgContext).mockResolvedValue({ userDbId: 'u_am' } as never)
    vi.mocked(promotePostFeedbackToThread).mockResolvedValue({ threadId: 't_new' })
    await replyToPostFeedbackAction({ reviewItemId: 'ri1', body: 'On it' })
    expect(notifyClientOfAmReply).toHaveBeenCalledWith({ threadId: 't_new', amUserId: 'u_am' })
  })

  it('addCommentAction notifies when an AM (Clerk session) comments', async () => {
    vi.mocked(getOrgContext).mockResolvedValue({ userDbId: 'u_am' } as never)
    vi.mocked(addComment).mockResolvedValue({ id: 'c1', threadId: 't1' } as never)
    await addCommentAction({ threadId: 't1', body: 'reply' })
    expect(notifyClientOfAmReply).toHaveBeenCalledWith({ threadId: 't1', amUserId: 'u_am' })
  })

  it('addCommentAction does NOT notify when a magic-link reviewer comments', async () => {
    vi.mocked(getOrgContext).mockResolvedValue(null as never)
    vi.mocked(getMagicLinkReviewerFromCookie).mockResolvedValue({ tokenHash: 'HASH', name: 'Dana' } as never)
    vi.mocked(addComment).mockResolvedValue({ id: 'c1', threadId: 't1' } as never)
    await addCommentAction({ threadId: 't1', body: 'reply' })
    expect(notifyClientOfAmReply).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Internal reply bell notify (participants / holder / mentioned)
// ---------------------------------------------------------------------------

describe('addCommentAction internal reply notify', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getMagicLinkReviewerFromCookie).mockResolvedValue(null)
    vi.mocked(addComment).mockResolvedValue({ id: 'c1', threadId: 't1' } as never)
    vi.mocked(db.postThread.findUnique).mockResolvedValue({
      postId: 'post_1',
      post: { clientId: 'client_1' },
    } as never)
    vi.mocked(internalMentionRosterForClient).mockResolvedValue([])
  })

  it('calls notifyInternalThreadReply with resolved mentionedUserIds for an internal author', async () => {
    vi.mocked(getOrgContext).mockResolvedValue({ userDbId: 'u_am' } as never)
    vi.mocked(internalMentionRosterForClient).mockResolvedValue([
      { id: 'u_des', name: 'Dan Designer', handle: 'dan.designer' },
    ])
    await addCommentAction({ threadId: 't1', body: 'hey @dan.designer take a look' })

    expect(internalMentionRosterForClient).toHaveBeenCalledWith('client_1')
    expect(notifyInternalThreadReply).toHaveBeenCalledWith({
      threadId: 't1',
      actorUserId: 'u_am',
      mentionedUserIds: ['u_des'],
    })
  })

  it('resolves no mentions when the body has none (still notifies participants/holder)', async () => {
    vi.mocked(getOrgContext).mockResolvedValue({ userDbId: 'u_am' } as never)
    await addCommentAction({ threadId: 't1', body: 'plain reply' })
    expect(notifyInternalThreadReply).toHaveBeenCalledWith({
      threadId: 't1',
      actorUserId: 'u_am',
      mentionedUserIds: [],
    })
  })

  it('does NOT call notifyInternalThreadReply when a magic-link reviewer comments', async () => {
    vi.mocked(getOrgContext).mockResolvedValue(null as never)
    vi.mocked(getMagicLinkReviewerFromCookie).mockResolvedValue({ tokenHash: 'HASH', name: 'Dana' } as never)
    await addCommentAction({ threadId: 't1', body: 'reply @dan.designer' })
    expect(notifyInternalThreadReply).not.toHaveBeenCalled()
  })
})
