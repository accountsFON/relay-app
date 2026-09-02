/**
 * Unit tests for rearmIfPendingSoon, notificationEmailTimerTask's self
 * re-arm (Fix 1).
 *
 * The idempotency key that books a run only covers the FIRST mention in a
 * five minute bucket; a mention created later in that same bucket is still
 * too young when that run fires. rearmIfPendingSoon is what books a follow
 * up run for the next bucket when that happens, so these tests pin: it fires
 * when a straggler is pending, stays silent when nothing is, and the key it
 * uses is the NEXT bucket, in its OWN `notif-email-rearm-` namespace,
 * separate from the ordinary schedule's `notif-email-` namespace in
 * `activity.ts`.
 *
 * Separate namespaces matter: an earlier version of this fix had the re-arm
 * reuse the ordinary `notif-email-${bucket}` key for the next bucket, on the
 * reasoning that this collapses a re-arm and an ordinary schedule for that
 * bucket into one run. That backfires, because a re-arm fires PARTWAY
 * through the bucket it targets, not at its start: a mention created in that
 * bucket after the re-armed run already fired would compute the same key,
 * find it already consumed, and get no run of its own. See
 * tests/server/jobs/notificationEmailTimer-rearm-namespace.test.ts for the
 * end to end regression proof (calls the real re-arm and the real ordinary
 * schedule for the same bucket and asserts their keys differ), which fails
 * against the pre-namespace-fix code and passes against this fix.
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
import {
  notificationEmailTimerIdempotencyKey,
  notificationEmailTimerRearmIdempotencyKey,
} from '@/server/services/activity'
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

  it('books the re-arm for the next bucket, in its own rearm namespace', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-09-02T15:00:10Z')
    vi.setSystemTime(now)
    vi.mocked(anyMentionPendingSoon).mockResolvedValue(true)

    await rearmIfPendingSoon()

    const key = vi.mocked(tasks.trigger).mock.calls[0][2]?.idempotencyKey
    const currentBucket = Math.floor(now.getTime() / ROLLUP_WINDOW_MS)

    // The next bucket, not the current one: a re-arm that targeted the
    // current bucket would fire before the run that is already executing.
    expect(key).toBe(notificationEmailTimerRearmIdempotencyKey(currentBucket + 1))
    expect(key).not.toBe(notificationEmailTimerRearmIdempotencyKey(currentBucket))

    // Its own `notif-email-rearm-` namespace, not the ordinary schedule's
    // `notif-email-` namespace for that same next bucket. This is the fix:
    // see notificationEmailTimer-rearm-namespace.test.ts for why a shared
    // namespace here is a real bug, not a harmless simplification.
    expect(key).not.toBe(notificationEmailTimerIdempotencyKey(currentBucket + 1))
    expect(key).toBe(`notif-email-rearm-${currentBucket + 1}`)
  })

  it("does not touch the ordinary schedule's key format or bucket", () => {
    const bucket = 5961205
    // Unchanged: still `notif-email-${bucket}` for the CURRENT bucket, no
    // rearm prefix, no bucket offset. Ordinary scheduling in activity.ts
    // was not part of this fix and must not have moved.
    expect(notificationEmailTimerIdempotencyKey(bucket)).toBe(`notif-email-${bucket}`)
  })

  it('does not throw when the pending probe itself fails', async () => {
    vi.mocked(anyMentionPendingSoon).mockRejectedValue(new Error('db down'))

    await expect(rearmIfPendingSoon()).resolves.not.toThrow()
    expect(tasks.trigger).not.toHaveBeenCalled()
  })
})
