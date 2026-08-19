import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/middleware/permissions', () => ({
  requireClientEditor: vi.fn(),
  canEditPostContent: vi.fn(),
}))
vi.mock('@/server/repositories/posts', () => ({ findPostById: vi.fn(), updatePost: vi.fn() }))
vi.mock('@/server/services/postVersions', () => ({
  snapshotPostVersion: vi.fn(),
  findVersion: vi.fn(),
}))
vi.mock('@/server/services/redoPost', () => ({ redoPostCaption: vi.fn() }))
vi.mock('@/server/services/activity', () => ({
  recordActivity: vi.fn(),
  ActivityKind: { post_edited: 'post_edited' },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/server/lib/relay-lock-guard', async (orig) => {
  const actual = await orig<typeof import('@/server/lib/relay-lock-guard')>()
  return { ...actual, assertBatchEditable: vi.fn() }
})

import { updatePostAction, restorePostVersionAction, redoPostAction } from '@/server/actions/posts'
import { requireClientEditor, canEditPostContent } from '@/server/middleware/permissions'
import { findPostById, updatePost } from '@/server/repositories/posts'
import { findVersion, snapshotPostVersion } from '@/server/services/postVersions'
import { redoPostCaption } from '@/server/services/redoPost'
import { assertBatchEditable, RelayCompletedError } from '@/server/lib/relay-lock-guard'

const mockPost = {
  id: 'p1',
  clientId: 'c1',
  contentRunId: 'r1',
  batchId: 'b1',
  caption: 'x',
  hashtags: [],
  graphicHook: null,
  designerNotes: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireClientEditor).mockResolvedValue({ userDbId: 'actor' } as never)
  // post.edit holds unless a test says otherwise (matches the AM/admin default).
  vi.mocked(canEditPostContent).mockReturnValue(true)
  vi.mocked(updatePost).mockResolvedValue({} as never)
  vi.mocked(findPostById).mockResolvedValue(mockPost as never)
  vi.mocked(redoPostCaption).mockResolvedValue({
    newCaption: 'new',
    postVersionId: 'pv1',
    costUsd: 0.001,
  } as never)
  vi.mocked(findVersion).mockResolvedValue({
    id: 'v1',
    postId: 'p1',
    caption: '',
    hashtags: [],
    graphicHook: null,
    designerNotes: null,
  } as never)
  vi.mocked(assertBatchEditable).mockResolvedValue(undefined)
})

describe('completed lock', () => {
  describe('updatePostAction', () => {
    it('reports the lock instead of throwing, and does not call updatePost, when the batch is completed', async () => {
      // Contract change (2026-08-19): a completed relay is an expected refusal,
      // not an exception, so the UI can say "this relay is completed" rather
      // than guessing at permissions. The invariant that matters is unchanged:
      // no write happens.
      vi.mocked(assertBatchEditable).mockRejectedValueOnce(new RelayCompletedError())
      await expect(updatePostAction('p1', { caption: 'y' })).resolves.toEqual({
        ok: false,
        reason: 'locked',
      })
      expect(updatePost).not.toHaveBeenCalled()
    })

    it('calls assertBatchEditable with the post batchId on happy path', async () => {
      await updatePostAction('p1', { caption: 'x' })
      expect(assertBatchEditable).toHaveBeenCalledWith('b1')
    })
  })

  describe('redoPostAction', () => {
    it('rejects with RelayCompletedError and does not call redoPostCaption when batch is completed', async () => {
      vi.mocked(assertBatchEditable).mockRejectedValueOnce(new RelayCompletedError())
      await expect(redoPostAction('p1')).rejects.toThrow(RelayCompletedError)
      expect(redoPostCaption).not.toHaveBeenCalled()
    })
  })

  describe('restorePostVersionAction', () => {
    it('rejects with RelayCompletedError and does not call updatePost when batch is completed', async () => {
      vi.mocked(assertBatchEditable).mockRejectedValueOnce(new RelayCompletedError())
      await expect(restorePostVersionAction('v1')).rejects.toThrow(RelayCompletedError)
      expect(updatePost).not.toHaveBeenCalled()
    })
  })
})

// ---------------------------------------------------------------------------
// Typed failure results (2026-08-19)
// The save used to throw for every failure, and both callers caught blindly and
// showed "You may not have permission to edit captions" whatever went wrong.
// It happened to be right for the AM permission bug, and would have been wrong
// and misleading for anything else. The action now names the reason.
// ---------------------------------------------------------------------------
describe('updatePostAction typed results', () => {
  it('returns ok on a successful save', async () => {
    vi.mocked(findPostById).mockResolvedValue(mockPost as never)
    vi.mocked(canEditPostContent).mockReturnValue(true)

    await expect(updatePostAction('p1', { caption: 'new' })).resolves.toEqual({
      ok: true,
    })
  })

  it('returns no-permission when the actor lacks post.edit', async () => {
    // The AM bug: client.edit passes the front door, post.edit is what the
    // write actually needs.
    vi.mocked(findPostById).mockResolvedValue(mockPost as never)
    vi.mocked(canEditPostContent).mockReturnValue(false)

    await expect(updatePostAction('p1', { caption: 'new' })).resolves.toEqual({
      ok: false,
      reason: 'no-permission',
    })
    expect(updatePost).not.toHaveBeenCalled()
  })

  it('does not snapshot a version when permission is refused', async () => {
    // Refuse before any write, so a rejected save leaves no half-done history.
    vi.mocked(findPostById).mockResolvedValue(mockPost as never)
    vi.mocked(canEditPostContent).mockReturnValue(false)

    await updatePostAction('p1', { caption: 'new' })
    expect(snapshotPostVersion).not.toHaveBeenCalled()
  })

  it('returns not-found instead of silently doing nothing when out of scope', async () => {
    // Previously a bare `return`: the editor closed and the change vanished
    // with no error at all.
    vi.mocked(findPostById).mockResolvedValue(null as never)

    await expect(updatePostAction('p1', { caption: 'new' })).resolves.toEqual({
      ok: false,
      reason: 'not-found',
    })
  })

  it('returns locked when the relay is completed', async () => {
    vi.mocked(findPostById).mockResolvedValue(mockPost as never)
    vi.mocked(canEditPostContent).mockReturnValue(true)
    vi.mocked(assertBatchEditable).mockRejectedValue(new RelayCompletedError())

    await expect(updatePostAction('p1', { caption: 'new' })).resolves.toEqual({
      ok: false,
      reason: 'locked',
    })
  })

  it('still throws on a genuinely unexpected failure', async () => {
    // A database fault must not be dressed up as a permission problem.
    vi.mocked(findPostById).mockResolvedValue(mockPost as never)
    vi.mocked(canEditPostContent).mockReturnValue(true)
    vi.mocked(updatePost).mockRejectedValue(new Error('connection reset'))

    await expect(updatePostAction('p1', { caption: 'new' })).rejects.toThrow(
      /connection reset/,
    )
  })
})
