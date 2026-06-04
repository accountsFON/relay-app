import { describe, it, expect } from 'vitest'
import { mapReviewDecision } from '@/lib/relay-review-decision'

const base = { approved: 0, changesRequested: 0, captionEdited: 0, totalPosts: 5 }

describe('mapReviewDecision', () => {
  it('all posts approved → approved', () => {
    expect(mapReviewDecision({ ...base, approved: 5 })).toBe('approved')
  })
  it('any changes requested → changes', () => {
    expect(mapReviewDecision({ ...base, approved: 4, changesRequested: 1 })).toBe('changes')
  })
  it('any caption edit → changes', () => {
    expect(mapReviewDecision({ ...base, approved: 4, captionEdited: 1 })).toBe('changes')
  })
  it('undecided posts (partial review) → changes', () => {
    expect(mapReviewDecision({ ...base, approved: 3 })).toBe('changes')
  })
  it('zero total posts → changes (never auto-schedules an empty batch)', () => {
    expect(mapReviewDecision({ approved: 0, changesRequested: 0, captionEdited: 0, totalPosts: 0 })).toBe('changes')
  })
})
