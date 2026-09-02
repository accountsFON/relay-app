import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/db/client', () => ({
  db: { activityEvent: { create: vi.fn() } },
}))
vi.mock('@trigger.dev/sdk/v3', () => ({
  tasks: { trigger: vi.fn() },
  // notificationEmailTimer.ts calls task({ id, run }) at module load time;
  // returning the config object gives `.id` for free, which is what the
  // taskId-pinning test below needs.
  task: vi.fn((config: { id: string }) => config),
  logger: { info: vi.fn() },
}))

import { db } from '@/db/client'
import { tasks } from '@trigger.dev/sdk/v3'
import { recordActivity } from '@/server/services/activity'
import { notificationEmailTimerTask } from '@/server/jobs/notificationEmailTimer'
import { ROLLUP_WINDOW_MS } from '@/lib/notification-email-rollup'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.activityEvent.create).mockResolvedValue({ id: 'e1' } as never)
})

// House precedent (tests/lib/format-relative.test.ts, tests/lib/magic-link.test.ts):
// an unconditional afterEach real-timers reset, so a failing assertion in a
// fake-timers test never leaks a mocked clock into a later test in this file.
afterEach(() => {
  vi.useRealTimers()
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
    // Pinned to the real task's id (not a hardcoded string) so renaming the
    // id in notificationEmailTimer.ts alone would fail this test instead of
    // leaving the timer silently never firing. Finding 2, task 9 review.
    expect(taskId).toBe(notificationEmailTimerTask.id)
    expect(payload).toEqual({})
    expect(options).toMatchObject({ delay: '5m' })
  })

  it('does not schedule when there are no mentions', async () => {
    await recordActivity({ ...base })

    expect(tasks.trigger).not.toHaveBeenCalled()
  })

  it('buckets the idempotency key so a burst creates one run', async () => {
    vi.useFakeTimers()
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
  })

  it('still records the activity when scheduling throws', async () => {
    vi.mocked(tasks.trigger).mockRejectedValue(new Error('trigger down'))

    const result = await recordActivity({ ...base, mentionedUserIds: ['u1'] })

    expect(result).toEqual({ id: 'e1' })
  })

  // Task 9 review Finding 1 (Important, Julio's ruling): awaiting the
  // Trigger.dev HTTP call from inside a caller's transaction holds an
  // interactive Prisma transaction open across a network round trip, which
  // can blow past Prisma's 5s timeout and roll back the caller's state
  // change from OUTSIDE recordActivity's try/catch. recordActivity must
  // never self-schedule when a `tx` was passed; the transactional caller
  // schedules post commit instead (see tests/server/services/relay.test.ts
  // for a call-site level proof of that post-commit scheduling).
  it('does not schedule when a tx is passed, even with mentions present', async () => {
    const tx = {
      activityEvent: {
        create: vi.fn().mockResolvedValue({ id: 'e2' }),
      },
    } as never

    await recordActivity({ ...base, mentionedUserIds: ['u1'] }, tx)

    expect(tasks.trigger).not.toHaveBeenCalled()
  })

  // The other half of the guard: no tx passed + mentions present still
  // schedules. Covered above by 'schedules a delayed sweep when mentions
  // were created', restated here as its own case so the guard's two
  // branches are each pinned by a dedicated test.
  it('still schedules when no tx is passed and mentions exist', async () => {
    await recordActivity({ ...base, mentionedUserIds: ['u1'] })

    expect(tasks.trigger).toHaveBeenCalledTimes(1)
  })

  // Fix 5: a kind in EXCLUDED_ROLLUP_KINDS already has its own purpose built
  // email (RelayHandoffEmail, ReviewSubmittedDigestEmail), so a mention on
  // one of them can never produce a rollup row. Booking a Trigger.dev run for
  // it would only wake the timer to find nothing due.
  it('does not schedule for a kind that already has its own bespoke email', async () => {
    await recordActivity({
      ...base,
      kind: 'batch_passed' as never,
      mentionedUserIds: ['u1'],
    })

    expect(tasks.trigger).not.toHaveBeenCalled()
  })
})
