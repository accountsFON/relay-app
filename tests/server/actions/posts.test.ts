import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/middleware/permissions', () => ({ requireClientEditor: vi.fn() }))
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
import { requireClientEditor } from '@/server/middleware/permissions'
import { findPostById, updatePost } from '@/server/repositories/posts'
import { findVersion } from '@/server/services/postVersions'
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
    it('rejects with RelayCompletedError and does not call updatePost when batch is completed', async () => {
      vi.mocked(assertBatchEditable).mockRejectedValueOnce(new RelayCompletedError())
      await expect(updatePostAction('p1', { caption: 'y' })).rejects.toThrow(RelayCompletedError)
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
