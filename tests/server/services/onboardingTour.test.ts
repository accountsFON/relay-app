/**
 * Unit tests for src/server/services/onboardingTour.ts.
 *
 * Pure unit test; the only external dependency is the prisma client,
 * which we mock at the module boundary. We exercise:
 *   - markLaunchPadDismissed sets launchPadDismissedAt and does NOT
 *     touch onboardingTourSeenAt.
 *   - markTourSeen sets BOTH columns to the same now() so the layout
 *     redirect predicate (both null) can never re fire afterwards.
 *   - resetTour clears both columns.
 *   - Returned timestamps are real Date instances (caller serializes).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  findUnique: vi.fn(),
}))

vi.mock('@/db/client', () => ({
  db: {
    user: {
      update: (args: unknown) => mocks.update(args),
      findUnique: (args: unknown) => mocks.findUnique(args),
    },
  },
}))

import {
  markLaunchPadDismissed,
  markTourSeen,
  markSeenTour,
  resetTour,
} from '@/server/services/onboardingTour'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.update.mockResolvedValue({})
})

describe('markLaunchPadDismissed', () => {
  it('sets launchPadDismissedAt on the matching user', async () => {
    const result = await markLaunchPadDismissed('user_1')

    expect(mocks.update).toHaveBeenCalledTimes(1)
    const call = mocks.update.mock.calls[0][0]
    expect(call.where).toEqual({ id: 'user_1' })
    expect(call.data.launchPadDismissedAt).toBeInstanceOf(Date)
    expect(call.data.onboardingTourSeenAt).toBeUndefined()
    expect(result.userId).toBe('user_1')
    expect(result.launchPadDismissedAt).toBeInstanceOf(Date)
  })
})

describe('markTourSeen', () => {
  it('sets BOTH onboardingTourSeenAt and launchPadDismissedAt', async () => {
    const result = await markTourSeen('user_2')

    expect(mocks.update).toHaveBeenCalledTimes(1)
    const call = mocks.update.mock.calls[0][0]
    expect(call.where).toEqual({ id: 'user_2' })
    expect(call.data.onboardingTourSeenAt).toBeInstanceOf(Date)
    expect(call.data.launchPadDismissedAt).toBeInstanceOf(Date)
    // Same instant on both columns so the predicate "both null" can
    // never re fire after a completed tour.
    expect(call.data.onboardingTourSeenAt).toEqual(call.data.launchPadDismissedAt)
    expect(result.userId).toBe('user_2')
    expect(result.onboardingTourSeenAt).toBeInstanceOf(Date)
    expect(result.launchPadDismissedAt).toBeInstanceOf(Date)
  })
})

describe('resetTour', () => {
  it('clears both columns to null', async () => {
    const result = await resetTour('user_3')

    expect(mocks.update).toHaveBeenCalledTimes(1)
    const call = mocks.update.mock.calls[0][0]
    expect(call.where).toEqual({ id: 'user_3' })
    expect(call.data).toEqual({
      onboardingTourSeenAt: null,
      launchPadDismissedAt: null,
    })
    expect(result.userId).toBe('user_3')
    expect(result.onboardingTourSeenAt).toBeNull()
    expect(result.launchPadDismissedAt).toBeNull()
  })
})

describe('markSeenTour', () => {
  it('appends a new tour id to seenTours', async () => {
    mocks.findUnique.mockResolvedValue({ seenTours: [] } as never)
    await markSeenTour('user_1', 'overview-v1')
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { seenTours: ['overview-v1'] },
    })
  })

  it('does not duplicate an id already present', async () => {
    mocks.update.mockClear()
    mocks.findUnique.mockResolvedValue({
      seenTours: ['overview-v1'],
    } as never)
    await markSeenTour('user_1', 'overview-v1')
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
