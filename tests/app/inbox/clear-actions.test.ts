import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/middleware/auth', () => ({
  requireOrgContext: vi.fn().mockResolvedValue({ userDbId: 'user-1', organizationDbId: 'org-1' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/server/repositories/activityEvents', () => ({
  deleteMention: vi.fn().mockResolvedValue(undefined),
  deleteAllMentionsForUser: vi.fn().mockResolvedValue(undefined),
  markMentionRead: vi.fn(),
}))

import { revalidatePath } from 'next/cache'
import { deleteMention, deleteAllMentionsForUser } from '@/server/repositories/activityEvents'
import { clearMentionAction, clearAllMentionsAction } from '@/app/(app)/clients/[id]/activity/actions'

describe('clearMentionAction', () => {
  beforeEach(() => vi.clearAllMocks())
  it('deletes the mention for the context user and revalidates the inbox', async () => {
    await clearMentionAction('mention-1')
    expect(deleteMention).toHaveBeenCalledWith('mention-1', 'user-1')
    expect(revalidatePath).toHaveBeenCalledWith('/inbox')
  })
})

describe('clearAllMentionsAction', () => {
  beforeEach(() => vi.clearAllMocks())
  it('deletes all mentions for the context user + org and revalidates the inbox', async () => {
    await clearAllMentionsAction()
    expect(deleteAllMentionsForUser).toHaveBeenCalledWith('user-1', 'org-1')
    expect(revalidatePath).toHaveBeenCalledWith('/inbox')
  })
})
