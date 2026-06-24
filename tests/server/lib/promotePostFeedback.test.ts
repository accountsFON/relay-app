import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/client', () => ({
  db: { reviewItem: { findUnique: vi.fn() } },
}))
vi.mock('@/server/repositories/threads', () => ({
  findOpenPostLevelReviewerThread: vi.fn(),
  createThread: vi.fn(),
  addComment: vi.fn(),
}))

import { db } from '@/db/client'
import {
  findOpenPostLevelReviewerThread,
  createThread,
  addComment,
} from '@/server/repositories/threads'
import { promotePostFeedbackToThread } from '@/server/lib/promotePostFeedback'

const reviewItem = {
  id: 'ri1',
  postId: 'p1',
  comment: 'Please soften the tone',
  reviewSession: {
    magicLink: { tokenHash: 'tok_hash', defaultReviewerName: 'Default' },
    reviewer: { name: 'Dana Client' },
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.reviewItem.findUnique).mockResolvedValue(reviewItem as never)
})

describe('promotePostFeedbackToThread', () => {
  it('creates a reviewer-attributed post-level thread seeded from Notes, then appends the AM reply', async () => {
    vi.mocked(findOpenPostLevelReviewerThread).mockResolvedValue(null)
    vi.mocked(createThread).mockResolvedValue({ threadId: 't_new' } as never)

    await promotePostFeedbackToThread({ reviewItemId: 'ri1', amUserId: 'u_am', body: 'On it!' })

    expect(createThread).toHaveBeenCalledWith({
      postId: 'p1',
      pin: { kind: 'post' },
      body: 'Please soften the tone',
      author: { kind: 'reviewer', reviewerToken: 'tok_hash', reviewerName: 'Dana Client' },
    })
    expect(addComment).toHaveBeenCalledWith({
      threadId: 't_new',
      body: 'On it!',
      author: { kind: 'am', userId: 'u_am' },
      imageUrl: null,
      imageWidth: null,
      imageHeight: null,
    })
  })

  it('reuses an existing post-level thread (idempotent) and only appends', async () => {
    vi.mocked(findOpenPostLevelReviewerThread).mockResolvedValue('t_exist')
    await promotePostFeedbackToThread({ reviewItemId: 'ri1', amUserId: 'u_am', body: 'Reply 2' })
    expect(createThread).not.toHaveBeenCalled()
    expect(addComment).toHaveBeenCalledWith({
      threadId: 't_exist',
      body: 'Reply 2',
      author: { kind: 'am', userId: 'u_am' },
      imageUrl: null,
      imageWidth: null,
      imageHeight: null,
    })
  })

  it('synthesizes an opener when Notes is empty', async () => {
    vi.mocked(db.reviewItem.findUnique).mockResolvedValue({ ...reviewItem, comment: null } as never)
    vi.mocked(findOpenPostLevelReviewerThread).mockResolvedValue(null)
    vi.mocked(createThread).mockResolvedValue({ threadId: 't_new' } as never)
    await promotePostFeedbackToThread({ reviewItemId: 'ri1', amUserId: 'u_am', body: 'Hi' })
    expect(createThread).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Requested changes' }),
    )
  })

  it('falls back to the magic link default reviewer name when no named reviewer', async () => {
    vi.mocked(db.reviewItem.findUnique).mockResolvedValue({
      ...reviewItem,
      reviewSession: { magicLink: { tokenHash: 'tok_hash', defaultReviewerName: 'Default' }, reviewer: null },
    } as never)
    vi.mocked(findOpenPostLevelReviewerThread).mockResolvedValue(null)
    vi.mocked(createThread).mockResolvedValue({ threadId: 't_new' } as never)
    await promotePostFeedbackToThread({ reviewItemId: 'ri1', amUserId: 'u_am', body: 'Hi' })
    expect(createThread).toHaveBeenCalledWith(
      expect.objectContaining({
        author: { kind: 'reviewer', reviewerToken: 'tok_hash', reviewerName: 'Default' },
      }),
    )
  })
})
