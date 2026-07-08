import { describe, it, expect } from 'vitest'
import { hadFeedback } from '@/app/(app)/clients/[id]/batches/[batchId]/review-sessions/[sessionId]/review-feedback-types'
import type { FeedbackPostVM } from '@/app/(app)/clients/[id]/batches/[batchId]/review-sessions/[sessionId]/review-feedback-types'

// hadFeedback only reads verdict / threads / comment; the rest of FeedbackPostVM
// is irrelevant here, so cast a minimal object.
function post(over: Partial<FeedbackPostVM>): FeedbackPostVM {
  return {
    verdict: 'approved',
    threads: [],
    comment: null,
    ...over,
  } as FeedbackPostVM
}

describe('hadFeedback', () => {
  it('false for a clean approved post (no threads/comment)', () => {
    expect(hadFeedback(post({}))).toBe(false)
  })
  it('true for changes_requested', () => {
    expect(hadFeedback(post({ verdict: 'changes_requested' }))).toBe(true)
  })
  it('true for caption_edited', () => {
    expect(hadFeedback(post({ verdict: 'caption_edited' }))).toBe(true)
  })
  it('true when it has a thread', () => {
    expect(hadFeedback(post({ threads: [{ id: 't' }] as never }))).toBe(true)
  })
  it('true when it has a comment', () => {
    expect(hadFeedback(post({ comment: 'note' }))).toBe(true)
  })
})
