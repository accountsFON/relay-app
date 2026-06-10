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

import { updatePostAction } from '@/server/actions/posts'
import { requireClientEditor } from '@/server/middleware/permissions'
import { findPostById, updatePost } from '@/server/repositories/posts'
import { recordActivity } from '@/server/services/activity'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireClientEditor).mockResolvedValue({ userDbId: 'actor' } as never)
  vi.mocked(updatePost).mockResolvedValue({} as never)
  vi.mocked(findPostById).mockResolvedValue({
    id: 'p1', clientId: 'c1', contentRunId: 'r1',
    caption: 'old', hashtags: ['#a'], graphicHook: 'hook', designerNotes: 'notes',
  } as never)
})

describe('updatePostAction change capture', () => {
  it('records post_edited with caption from/to', async () => {
    await updatePostAction('p1', { caption: 'new' } as never)
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'post_edited',
        payload: { changes: [{ field: 'caption', from: 'old', to: 'new' }] },
      }),
    )
  })

  it('records nothing when nothing changed', async () => {
    await updatePostAction('p1', { caption: 'old' } as never)
    expect(recordActivity).not.toHaveBeenCalled()
  })
})
