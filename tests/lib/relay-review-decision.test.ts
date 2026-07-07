import { describe, it, expect } from 'vitest'
import { mapReviewDecision, isApprovedWithFeedback } from '@/lib/relay-review-decision'

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

describe('isApprovedWithFeedback (P1 #16)', () => {
  it('approved + a copy edit → true (not a clean approval)', () => {
    expect(isApprovedWithFeedback('approved', 'edited caption', 0)).toBe(true)
  })
  it('approved + an open pin → true', () => {
    expect(isApprovedWithFeedback('approved', null, 1)).toBe(true)
  })
  it('approved + edit + pins → true', () => {
    expect(isApprovedWithFeedback('approved', 'edited', 2)).toBe(true)
  })
  it('approved, clean (no edit, no pins) → false', () => {
    expect(isApprovedWithFeedback('approved', null, 0)).toBe(false)
  })
  it('non-approved verdicts are never "approved with feedback"', () => {
    expect(isApprovedWithFeedback('changes_requested', null, 3)).toBe(false)
    expect(isApprovedWithFeedback('caption_edited', 'x', 0)).toBe(false)
    expect(isApprovedWithFeedback('not_reviewed', null, 0)).toBe(false)
  })
})
