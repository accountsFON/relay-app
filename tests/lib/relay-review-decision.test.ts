import { describe, it, expect } from 'vitest'
import {
  mapReviewDecision,
  isApprovedWithFeedback,
  summarizeReviewDecisions,
} from '@/lib/relay-review-decision'

const counts = { approved: 0, changesRequested: 0, captionEdited: 0 }

describe('summarizeReviewDecisions (P2 #27)', () => {
  const item = (
    over: Partial<{ decision: string; suggestedCaption: string | null; openPinCount: number }>,
  ) => ({ decision: 'not_reviewed', suggestedCaption: null, openPinCount: 0, ...over })

  it('counts a clean approval as approved', () => {
    const s = summarizeReviewDecisions([item({ decision: 'approved' })])
    expect(s).toEqual({ approved: 1, changesRequested: 0, captionEdited: 0, totalPosts: 1 })
  })

  it('counts approved-with-copy-edit as changes, not approved', () => {
    const s = summarizeReviewDecisions([item({ decision: 'approved', suggestedCaption: 'new caption' })])
    expect(s).toMatchObject({ approved: 0, changesRequested: 1 })
  })

  it('counts approved-with-open-pin as changes, not approved', () => {
    const s = summarizeReviewDecisions([item({ decision: 'approved', openPinCount: 2 })])
    expect(s).toMatchObject({ approved: 0, changesRequested: 1 })
  })

  it('counts explicit changes_requested and caption_edited into their buckets', () => {
    const s = summarizeReviewDecisions([
      item({ decision: 'changes_requested' }),
      item({ decision: 'caption_edited' }),
    ])
    expect(s).toMatchObject({ approved: 0, changesRequested: 1, captionEdited: 1 })
  })

  it('totalPosts counts every item incl. not_reviewed; approved excludes fed-back posts', () => {
    const s = summarizeReviewDecisions([
      item({ decision: 'approved' }),
      item({ decision: 'approved', openPinCount: 1 }),
      item({ decision: 'not_reviewed' }),
    ])
    expect(s.totalPosts).toBe(3)
    expect(s.approved).toBe(1)
    expect(s.approved === s.totalPosts).toBe(false)
  })
})

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
