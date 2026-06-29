import { describe, it, expect } from 'vitest'
import { selectClientReviewPill, countFeedbackPosts } from '@/lib/client-review-pill'

function session(over: Partial<Record<string, unknown>>) {
  return {
    id: 'x',
    kind: 'client',
    round: 1,
    status: 'in_progress',
    startedAt: new Date('2026-06-01T00:00:00Z'),
    submittedAt: null,
    reviewer: { name: 'Jane' },
    items: [],
    ...over,
  } as never
}

describe('countFeedbackPosts', () => {
  it('counts changes, caption edits, and commented posts; ignores clean approvals', () => {
    const items = [
      { decision: 'approved', comment: null },
      { decision: 'changes_requested', comment: null },
      { decision: 'caption_edited', comment: null },
      { decision: 'approved', comment: 'looks good but...' },
      { decision: 'not_reviewed', comment: '   ' },
    ]
    expect(countFeedbackPosts(items)).toBe(3)
  })

  it('returns 0 for a clean approve-all', () => {
    expect(
      countFeedbackPosts([
        { decision: 'approved', comment: null },
        { decision: 'approved', comment: null },
      ]),
    ).toBe(0)
  })
})

describe('selectClientReviewPill', () => {
  it('returns null when there are no client sessions', () => {
    expect(selectClientReviewPill([])).toBeNull()
    expect(selectClientReviewPill([session({ kind: 'internal' })])).toBeNull()
  })

  it('excludes internal and superseded, and picks the highest round', () => {
    const result = selectClientReviewPill([
      session({ id: 'r1', round: 1, status: 'superseded' }),
      session({ id: 'r2', round: 2, status: 'in_progress' }),
      session({ id: 'int', kind: 'internal', round: 9 }),
    ])
    expect(result?.session.id).toBe('r2')
  })

  it('collapses duplicate round-1 rows, preferring the submitted one with its feedback count', () => {
    const result = selectClientReviewPill([
      session({ id: 'dupe', round: 1, status: 'in_progress' }),
      session({
        id: 'real',
        round: 1,
        status: 'submitted',
        submittedAt: new Date('2026-06-02T00:00:00Z'),
        items: [
          { decision: 'changes_requested', comment: null },
          { decision: 'approved', comment: null },
        ],
      }),
    ])
    expect(result?.session.id).toBe('real')
    expect(result?.feedbackCount).toBe(1)
  })
})
