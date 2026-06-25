import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/middleware/auth', () => ({
  getOrgContext: vi.fn().mockResolvedValue({ userDbId: 'user_1' }),
}))
vi.mock('@/server/services/onboardingTour', () => ({
  markSeenTour: vi.fn().mockResolvedValue(undefined),
  markTourSeen: vi.fn().mockResolvedValue(undefined),
}))

import { POST } from '@/app/api/onboarding/tour-seen/route'
import { markSeenTour } from '@/server/services/onboardingTour'

function req(body: unknown) {
  return new Request('http://test/api/onboarding/tour-seen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/onboarding/tour-seen', () => {
  it('marks a valid tourId seen', async () => {
    const res = await POST(req({ tourId: 'overview-v1' }))
    expect(res.status).toBe(200)
    expect(markSeenTour).toHaveBeenCalledWith('user_1', 'overview-v1')
  })

  it('rejects an unknown tourId', async () => {
    const res = await POST(req({ tourId: 'bogus' }))
    expect(res.status).toBe(400)
    expect(markSeenTour).not.toHaveBeenCalled()
  })
})
