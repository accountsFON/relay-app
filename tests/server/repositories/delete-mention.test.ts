import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/client', () => ({
  db: { mention: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) } },
}))

import { db } from '@/db/client'
import { deleteMention, deleteAllMentionsForUser } from '@/server/repositories/activityEvents'

describe('deleteMention', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes only the caller-owned mention by id', async () => {
    await deleteMention('mention-1', 'user-1')
    expect(db.mention.deleteMany).toHaveBeenCalledWith({
      where: { id: 'mention-1', mentionedUserId: 'user-1' },
    })
  })
})

describe('deleteAllMentionsForUser', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes all of the user mentions scoped to the active org', async () => {
    await deleteAllMentionsForUser('user-1', 'org-1')
    expect(db.mention.deleteMany).toHaveBeenCalledWith({
      where: {
        mentionedUserId: 'user-1',
        event: { client: { organizationId: 'org-1' } },
      },
    })
  })
})
