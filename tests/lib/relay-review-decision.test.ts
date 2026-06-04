import { describe, it, expect } from 'vitest'
import { mapReviewDecision } from '@/lib/relay-review-decision'

const counts = { approved: 0, changesRequested: 0, captionEdited: 0 }

describe('mapReviewDecision', () => {
  it('every batch post approved → approved', () => {
    expect(mapReviewDecision({ ...counts, approved: 5 }, 5)).toBe('approved')
  })
  it('any changes requested → changes', () => {
    expect(mapReviewDecision({ ...counts, approved: 4, changesRequested: 1 }, 5)).toBe('changes')
  })
  it('any caption edit → changes', () => {
    expect(mapReviewDecision({ ...counts, approved: 4, captionEdited: 1 }, 5)).toBe('changes')
  })
  it('fewer approvals than batch posts (partial review) → changes', () => {
    expect(mapReviewDecision({ ...counts, approved: 3 }, 5)).toBe('changes')
  })
  it('zero batch posts → changes', () => {
    expect(mapReviewDecision({ ...counts }, 0)).toBe('changes')
  })
})
