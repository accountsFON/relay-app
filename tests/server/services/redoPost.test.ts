import { describe, it, expect, vi, beforeEach } from 'vitest'

const { generateCaptionsMock, snapshotPostVersionMock } = vi.hoisted(() => ({
  generateCaptionsMock: vi.fn(),
  snapshotPostVersionMock: vi.fn(),
}))

vi.mock('@/db/client', () => ({
  db: {
    post: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    contentRun: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    client: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/server/services/captionGenerator', () => ({
  generateCaptions: generateCaptionsMock,
}))

vi.mock('@/server/services/postVersions', () => ({
  snapshotPostVersion: snapshotPostVersionMock,
}))

import { db } from '@/db/client'
import {
  redoPostCaption,
  RedoPostNotFoundError,
  RedoPostMissingContextError,
} from '@/server/services/redoPost'

const POST = {
  id: 'post_1',
  caption: 'Old caption',
  hashtags: ['#old'],
  graphicHook: 'Old hook',
  designerNotes: 'Old notes',
  postDate: new Date(Date.UTC(2026, 4, 14)), // Thursday, May 14, 2026
  clientId: 'client_1',
  contentRunId: 'run_1',
}

const RUN = {
  id: 'run_1',
  brief: 'a brand brief',
  supportingFacts: 'some facts about the company',
  openaiCostUsd: 0.12,
}

const CLIENT = {
  postLength: 'medium',
  dos: 'be friendly',
  donts: 'no jargon',
  brandVoice: 'warm and approachable',
  mainCta: 'Visit our website',
}

const FRESH = {
  postNumber: 1,
  date: '2026-05-14',
  caption: 'Fresh new caption',
  hashtags: ['#fresh', '#new'],
  graphicHook: 'New hook',
  designerNotes: 'New notes',
  ctaIndex: 0,
}

describe('redoPostCaption', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('regenerates the post body and snapshots the prior version', async () => {
    vi.mocked(db.post.findUnique).mockResolvedValue(POST as never)
    vi.mocked(db.contentRun.findUnique).mockResolvedValue(RUN as never)
    vi.mocked(db.client.findUnique).mockResolvedValue(CLIENT as never)
    snapshotPostVersionMock.mockResolvedValue({ id: 'ver_1' })
    generateCaptionsMock.mockResolvedValue({
      posts: [FRESH],
      cost: { inputTokens: 100, outputTokens: 50, usd: 0.05 },
    })
    vi.mocked(db.post.update).mockResolvedValue({} as never)
    vi.mocked(db.contentRun.update).mockResolvedValue({} as never)

    const result = await redoPostCaption({
      postId: 'post_1',
      actorUserId: 'user_am',
    })

    // Snapshots the OLD post body so it can be restored.
    expect(snapshotPostVersionMock).toHaveBeenCalledWith({
      postId: 'post_1',
      authorId: 'user_am',
      body: {
        caption: 'Old caption',
        hashtags: ['#old'],
        graphicHook: 'Old hook',
        designerNotes: 'Old notes',
      },
    })

    // Updates the post with the fresh model output + CTA suffix.
    expect(db.post.update).toHaveBeenCalledWith({
      where: { id: 'post_1' },
      data: expect.objectContaining({
        caption: 'Fresh new caption\n\nVisit our website',
        hashtags: ['#fresh', '#new'],
        graphicHook: 'New hook',
        designerNotes: 'New notes',
      }),
    })

    // Adds the redo cost to the originating ContentRun's running total.
    expect(db.contentRun.update).toHaveBeenCalledWith({
      where: { id: 'run_1' },
      data: { openaiCostUsd: 0.17 },
    })

    expect(result.postVersionId).toBe('ver_1')
    expect(result.costUsd).toBe(0.05)
  })

  it('throws RedoPostNotFoundError if the post is missing', async () => {
    vi.mocked(db.post.findUnique).mockResolvedValue(null)
    await expect(
      redoPostCaption({ postId: 'missing', actorUserId: 'user_am' }),
    ).rejects.toBeInstanceOf(RedoPostNotFoundError)
  })

  it('throws RedoPostMissingContextError if the ContentRun has no brief', async () => {
    vi.mocked(db.post.findUnique).mockResolvedValue(POST as never)
    vi.mocked(db.contentRun.findUnique).mockResolvedValue({
      ...RUN,
      brief: null,
    } as never)
    vi.mocked(db.client.findUnique).mockResolvedValue(CLIENT as never)
    await expect(
      redoPostCaption({ postId: 'post_1', actorUserId: 'user_am' }),
    ).rejects.toBeInstanceOf(RedoPostMissingContextError)
  })

  it('passes a single posting date matching the post date (UTC components)', async () => {
    vi.mocked(db.post.findUnique).mockResolvedValue(POST as never)
    vi.mocked(db.contentRun.findUnique).mockResolvedValue(RUN as never)
    vi.mocked(db.client.findUnique).mockResolvedValue(CLIENT as never)
    snapshotPostVersionMock.mockResolvedValue({ id: 'ver_1' })
    generateCaptionsMock.mockResolvedValue({
      posts: [FRESH],
      cost: { inputTokens: 1, outputTokens: 1, usd: 0.01 },
    })
    vi.mocked(db.post.update).mockResolvedValue({} as never)
    vi.mocked(db.contentRun.update).mockResolvedValue({} as never)

    await redoPostCaption({ postId: 'post_1', actorUserId: 'user_am' })

    expect(generateCaptionsMock).toHaveBeenCalledWith(
      RUN.brief,
      RUN.supportingFacts,
      [expect.objectContaining({ date: '2026-05-14', day: 'Thursday' })],
      expect.any(Object),
      expect.any(Array),
    )
  })

  it('returns "" for postVersionId when the snapshot helper returns null', async () => {
    vi.mocked(db.post.findUnique).mockResolvedValue(POST as never)
    vi.mocked(db.contentRun.findUnique).mockResolvedValue(RUN as never)
    vi.mocked(db.client.findUnique).mockResolvedValue(CLIENT as never)
    // Simulate the postVersions module swallowing an error and returning null.
    snapshotPostVersionMock.mockResolvedValue(null)
    generateCaptionsMock.mockResolvedValue({
      posts: [FRESH],
      cost: { inputTokens: 1, outputTokens: 1, usd: 0.01 },
    })
    vi.mocked(db.post.update).mockResolvedValue({} as never)
    vi.mocked(db.contentRun.update).mockResolvedValue({} as never)

    const result = await redoPostCaption({
      postId: 'post_1',
      actorUserId: 'user_am',
    })
    expect(result.postVersionId).toBe('')
  })
})
