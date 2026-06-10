import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/client', () => ({
  db: { mention: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } },
}))
vi.mock('@/server/middleware/auth', () => ({
  requireOrgContext: vi
    .fn()
    .mockResolvedValue({ userDbId: 'u1', organizationDbId: 'org1', role: 'account_manager' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { db } from '@/db/client'
import { revalidatePath } from 'next/cache'
import { markAllMentionsReadAction } from '@/app/(app)/clients/[id]/activity/actions'

describe('markAllMentionsReadAction', () => {
  beforeEach(() => vi.clearAllMocks())

  it('marks unread read scoped to the active org + the viewer-assigned clients (not other agencies)', async () => {
    await markAllMentionsReadAction()
    expect(db.mention.updateMany).toHaveBeenCalledWith({
      where: {
        mentionedUserId: 'u1',
        readAt: null,
        event: { client: { organizationId: 'org1', assignedAmId: 'u1' } },
      },
      data: { readAt: expect.any(Date) },
    })
    expect(revalidatePath).toHaveBeenCalledWith('/inbox')
  })
})
