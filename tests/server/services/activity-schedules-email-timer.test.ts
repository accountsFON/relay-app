import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/client', () => ({
  db: { activityEvent: { create: vi.fn() } },
}))
vi.mock('@trigger.dev/sdk/v3', () => ({
  tasks: { trigger: vi.fn() },
}))

import { db } from '@/db/client'
import { tasks } from '@trigger.dev/sdk/v3'
import { recordActivity } from '@/server/services/activity'
import { ROLLUP_WINDOW_MS } from '@/lib/notification-email-rollup'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.activityEvent.create).mockResolvedValue({ id: 'e1' } as never)
})

const base = {
  clientId: 'c1',
  kind: 'post_comment_added' as never,
  payload: {},
}

describe('recordActivity email timer scheduling', () => {
  it('schedules a delayed sweep when mentions were created', async () => {
    await recordActivity({ ...base, mentionedUserIds: ['u1'] })

    expect(tasks.trigger).toHaveBeenCalledTimes(1)
    const [taskId, payload, options] = vi.mocked(tasks.trigger).mock.calls[0]
    expect(taskId).toBe('notification-email-timer')
    expect(payload).toEqual({})
    expect(options).toMatchObject({ delay: '5m' })
  })

  it('does not schedule when there are no mentions', async () => {
    await recordActivity({ ...base })

    expect(tasks.trigger).not.toHaveBeenCalled()
  })

  it('buckets the idempotency key so a burst creates one run', async () => {
    const now = new Date('2026-09-02T15:00:10Z')
    vi.setSystemTime(now)

    await recordActivity({ ...base, mentionedUserIds: ['u1'] })
    await recordActivity({ ...base, mentionedUserIds: ['u2'] })

    const keyA = vi.mocked(tasks.trigger).mock.calls[0][2]?.idempotencyKey
    const keyB = vi.mocked(tasks.trigger).mock.calls[1][2]?.idempotencyKey
    expect(keyA).toBe(keyB)
    expect(keyA).toBe(
      `notif-email-${Math.floor(now.getTime() / ROLLUP_WINDOW_MS)}`,
    )

    vi.useRealTimers()
  })

  it('still records the activity when scheduling throws', async () => {
    vi.mocked(tasks.trigger).mockRejectedValue(new Error('trigger down'))

    const result = await recordActivity({ ...base, mentionedUserIds: ['u1'] })

    expect(result).toEqual({ id: 'e1' })
  })
})
