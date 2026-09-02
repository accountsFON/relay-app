/**
 * Unit tests for rearmIfPendingSoon, notificationEmailTimerTask's self
 * re-arm (Fix 1).
 *
 * The idempotency key that books a run only covers the FIRST mention in a
 * five minute bucket; a mention created later in that same bucket is still
 * too young when that run fires. rearmIfPendingSoon is what books a follow
 * up run for the next bucket when that happens, so these tests pin: it fires
 * when a straggler is pending, stays silent when nothing is, and the key it
 * uses is the NEXT bucket in the exact same format `activity.ts` uses for an
 * ordinary schedule.
 *
 * Exercises the exported `rearmIfPendingSoon` directly rather than the
 * task's `run`: Trigger.dev's `Task` type does not expose `.run()` to
 * callers (matching the precedent in
 * tests/server/services/activity-schedules-email-timer.test.ts, which tests
 * scheduling via `recordActivity` rather than by invoking a task run).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/db/client', () => ({
  db: { activityEvent: { create: vi.fn() } },
}))
vi.mock('@trigger.dev/sdk/v3', () => ({
  tasks: { trigger: vi.fn() },
  task: vi.fn((config: { id: string; run: () => unknown }) => config),
  logger: { info: vi.fn(), error: vi.fn() },
}))
vi.mock('@/server/services/notificationEmailTick', () => ({
  notificationEmailTick: vi.fn(),
}))
vi.mock('@/server/repositories/activityEvents', () => ({
  anyMentionPendingSoon: vi.fn(),
}))

import { tasks } from '@trigger.dev/sdk/v3'
import { anyMentionPendingSoon } from '@/server/repositories/activityEvents'
import { rearmIfPendingSoon } from '@/server/jobs/notificationEmailTimer'
import { notificationEmailTimerIdempotencyKey } from '@/server/services/activity'
import { ROLLUP_WINDOW_MS } from '@/lib/notification-email-rollup'

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('rearmIfPendingSoon', () => {
  it('re-arms when a young pending mention exists', async () => {
    vi.mocked(anyMentionPendingSoon).mockResolvedValue(true)

    await rearmIfPendingSoon()

    expect(tasks.trigger).toHaveBeenCalledTimes(1)
    const [taskId, payload, options] = vi.mocked(tasks.trigger).mock.calls[0]
    expect(taskId).toBe('notification-email-timer')
    expect(payload).toEqual({})
    expect(options).toMatchObject({ delay: '5m' })
  })

  it('does not re-arm when nothing is pending', async () => {
    vi.mocked(anyMentionPendingSoon).mockResolvedValue(false)

    await rearmIfPendingSoon()

    expect(tasks.trigger).not.toHaveBeenCalled()
  })

  it('books the re-arm for the next bucket, in the same format activity.ts uses', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-09-02T15:00:10Z')
    vi.setSystemTime(now)
    vi.mocked(anyMentionPendingSoon).mockResolvedValue(true)

    await rearmIfPendingSoon()

    const key = vi.mocked(tasks.trigger).mock.calls[0][2]?.idempotencyKey
    const currentBucket = Math.floor(now.getTime() / ROLLUP_WINDOW_MS)
    expect(key).toBe(notificationEmailTimerIdempotencyKey(currentBucket + 1))
    // Not the current bucket's key: a re-arm that reused the current bucket
    // would collapse into the run that is already executing instead of
    // booking a fresh one for the straggler.
    expect(key).not.toBe(notificationEmailTimerIdempotencyKey(currentBucket))
  })

  it('does not throw when the pending probe itself fails', async () => {
    vi.mocked(anyMentionPendingSoon).mockRejectedValue(new Error('db down'))

    await expect(rearmIfPendingSoon()).resolves.not.toThrow()
    expect(tasks.trigger).not.toHaveBeenCalled()
  })
})
