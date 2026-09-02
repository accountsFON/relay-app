/**
 * Regression test for the key-namespace collision the scoped re-review
 * found in the first Fix 1 pass.
 *
 * A re-arm booked in bucket B for bucket B+1 fires PARTWAY THROUGH bucket
 * B+1, not at its start. Before this fix, the re-arm and an ordinary
 * schedule for that SAME bucket B+1 both wrote the identical idempotency
 * key. A mention created in B+1 after the re-armed run had already fired
 * would schedule an ordinary run that collided with that already-consumed
 * key (the 15 minute TTL outlives the completed run) and Trigger.dev's
 * dedup would book nothing, stranding that mention exactly the way Fix 1
 * exists to prevent, just shifted one bucket along.
 *
 * This test calls the REAL re-arm and the REAL ordinary schedule for the
 * bucket the re-arm targets, and asserts their idempotency keys differ.
 * Run unmodified against the pre-namespace-fix commit, it fails: both
 * compute `notif-email-${bucket}`. Fixed, it passes: the re-arm lands in
 * its own separate `notif-email-rearm-` namespace.
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
import { scheduleNotificationEmailTimer } from '@/server/services/activity'
import { ROLLUP_WINDOW_MS } from '@/lib/notification-email-rollup'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(anyMentionPendingSoon).mockResolvedValue(true)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('re-arm key namespace does not collide with an ordinary schedule for the same bucket', () => {
  it('lets an ordinary schedule for the re-armed bucket book its own run', async () => {
    vi.useFakeTimers()

    // A re-arm fires late in bucket B, booking a run for bucket B+1.
    const firingInBucketB = new Date('2026-09-02T15:00:10Z')
    vi.setSystemTime(firingInBucketB)
    await rearmIfPendingSoon()
    const rearmKey = vi.mocked(tasks.trigger).mock.calls[0][2]?.idempotencyKey
    const nextBucket = Math.floor(firingInBucketB.getTime() / ROLLUP_WINDOW_MS) + 1

    vi.mocked(tasks.trigger).mockClear()

    // A mention created inside bucket B+1, AFTER the re-armed run already
    // fired (its own 5 minute delay has elapsed), schedules an ordinary run
    // for that same bucket B+1.
    const laterInBucketBPlus1 = new Date(nextBucket * ROLLUP_WINDOW_MS + 60_000)
    vi.setSystemTime(laterInBucketBPlus1)
    await scheduleNotificationEmailTimer()
    const scheduleKey = vi.mocked(tasks.trigger).mock.calls[0][2]?.idempotencyKey

    // The regression: if these two calls write the SAME idempotency key,
    // Trigger.dev's dedup treats the ordinary schedule as a duplicate of
    // the already-completed re-arm and books nothing, stranding the
    // mention that triggered it.
    expect(scheduleKey).not.toBe(rearmKey)
  })
})
