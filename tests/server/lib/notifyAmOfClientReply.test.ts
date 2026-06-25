import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/db/client', () => ({ db: { postThread: { findUnique: vi.fn() } } }))
vi.mock('@/server/services/activity', () => ({ recordActivity: vi.fn() }))
import { db } from '@/db/client'
import { recordActivity } from '@/server/services/activity'
import { notifyAmOfClientReply } from '@/server/lib/notifyAmOfClientReply'

beforeEach(() => vi.clearAllMocks())

it('records post_comment_added mentioning the assigned AM', async () => {
  vi.mocked(db.postThread.findUnique).mockResolvedValue({ postId: 'p1', post: { batch: { client: { id: 'c1', assignedAmId: 'am1' } } } } as never)
  await notifyAmOfClientReply({ threadId: 't1' })
  expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'c1', postId: 'p1', kind: 'post_comment_added', mentionedUserIds: ['am1'] }))
})
it('no-ops the mention when there is no assigned AM', async () => {
  vi.mocked(db.postThread.findUnique).mockResolvedValue({ postId: 'p1', post: { batch: { client: { id: 'c1', assignedAmId: null } } } } as never)
  await notifyAmOfClientReply({ threadId: 't1' })
  expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ mentionedUserIds: [] }))
})
it('never throws and skips when the thread is missing', async () => {
  vi.mocked(db.postThread.findUnique).mockResolvedValue(null as never)
  await expect(notifyAmOfClientReply({ threadId: 't1' })).resolves.toBeUndefined()
  expect(recordActivity).not.toHaveBeenCalled()
})
