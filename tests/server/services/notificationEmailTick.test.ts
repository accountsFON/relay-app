import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/repositories/activityEvents', () => ({
  anyMentionDueForEmail: vi.fn(),
  listMentionsDueForEmail: vi.fn(),
  claimMentionsForEmail: vi.fn(),
  releaseMentionsForEmail: vi.fn(),
}))
vi.mock('@/server/services/sendNotificationRollupEmail', () => ({
  sendNotificationRollupEmail: vi.fn(),
}))

import {
  anyMentionDueForEmail,
  listMentionsDueForEmail,
} from '@/server/repositories/activityEvents'
import { notificationEmailTick } from '@/server/services/notificationEmailTick'

beforeEach(() => vi.clearAllMocks())

describe('notificationEmailTick', () => {
  it('returns null and does no further work when the probe is empty', async () => {
    vi.mocked(anyMentionDueForEmail).mockResolvedValue(false)

    expect(await notificationEmailTick()).toBeNull()
    expect(listMentionsDueForEmail).not.toHaveBeenCalled()
  })

  it('runs the sweep when the probe finds something', async () => {
    vi.mocked(anyMentionDueForEmail).mockResolvedValue(true)
    vi.mocked(listMentionsDueForEmail).mockResolvedValue([])

    const result = await notificationEmailTick()

    expect(listMentionsDueForEmail).toHaveBeenCalled()
    expect(result).toEqual({
      recipients: 0,
      emailsSent: 0,
      mentionsEmailed: 0,
      failures: 0,
    })
  })

  it('never throws when the probe itself fails', async () => {
    vi.mocked(anyMentionDueForEmail).mockRejectedValue(new Error('db down'))

    await expect(notificationEmailTick()).resolves.toBeNull()
  })
})
