import { describe, it, expect } from 'vitest'
import {
  hadFeedback,
  isRelevantToDesigner,
} from '@/app/(app)/clients/[id]/batches/[batchId]/review-sessions/[sessionId]/review-feedback-types'
import type { FeedbackPostVM } from '@/app/(app)/clients/[id]/batches/[batchId]/review-sessions/[sessionId]/review-feedback-types'

// hadFeedback only reads verdict / threads / comment; the rest of FeedbackPostVM
// is irrelevant here, so cast a minimal object.
function post(over: Partial<FeedbackPostVM>): FeedbackPostVM {
  return {
    verdict: 'approved',
    threads: [],
    comment: null,
    flags: [],
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

describe('isRelevantToDesigner (P2 #29)', () => {
  it('false for a clean approved post with no flags', () => {
    expect(isRelevantToDesigner(post({}))).toBe(false)
  })
  it('true when the post had client feedback', () => {
    expect(isRelevantToDesigner(post({ verdict: 'changes_requested' }))).toBe(true)
  })
  it('true when a clean approved post carries a designer flag', () => {
    // The AM can flag an approved post for the designer; hadFeedback is false but
    // the designer must still see it (else the task vanishes / batch deadlocks).
    expect(
      isRelevantToDesigner(post({ verdict: 'approved', flags: [{ id: 'f' }] as never })),
    ).toBe(true)
  })
})
