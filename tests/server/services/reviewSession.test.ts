/**
 * Pure-helper tests for the ReviewSession repository.
 *
 * Only `computeSummary` is pure right now (everything else hits the DB and
 * lives in the integration suite at
 * `tests/server/repositories/reviewSessions.integration.test.ts`).
 *
 * Kept separate so it runs under the unit runner without a TEST_DATABASE_URL.
 */
import { describe, it, expect } from 'vitest'
import {
  assertSessionKindInvariant,
  computeSummary,
} from '@/server/repositories/reviewSessions'

describe('computeSummary', () => {
  it('rolls up a mix of decisions', () => {
    expect(
      computeSummary([
        { decision: 'approved' },
        { decision: 'approved' },
        { decision: 'changes_requested' },
        { decision: 'caption_edited' },
        { decision: 'not_reviewed' },
      ]),
    ).toEqual({
      approved: 2,
      changesRequested: 1,
      captionEdited: 1,
      totalPosts: 5,
    })
  })

  it('returns zeros for an empty session', () => {
    expect(computeSummary([])).toEqual({
      approved: 0,
      changesRequested: 0,
      captionEdited: 0,
      totalPosts: 0,
    })
  })

  it('counts not_reviewed in totalPosts but not in any decision bucket', () => {
    expect(
      computeSummary([
        { decision: 'not_reviewed' },
        { decision: 'not_reviewed' },
        { decision: 'not_reviewed' },
      ]),
    ).toEqual({
      approved: 0,
      changesRequested: 0,
      captionEdited: 0,
      totalPosts: 3,
    })
  })
})

describe('assertSessionKindInvariant', () => {
  it('accepts a valid client session (magicLinkId set, no reviewerUserId)', () => {
    expect(() =>
      assertSessionKindInvariant({
        kind: 'client',
        magicLinkId: 'ml_1',
        reviewerUserId: null,
      }),
    ).not.toThrow()
  })

  it('accepts a valid internal session (reviewerUserId set, no magicLinkId)', () => {
    expect(() =>
      assertSessionKindInvariant({
        kind: 'internal',
        magicLinkId: null,
        reviewerUserId: 'user_1',
      }),
    ).not.toThrow()
  })

  it('throws when a client session also has a reviewerUserId', () => {
    expect(() =>
      assertSessionKindInvariant({
        kind: 'client',
        magicLinkId: 'ml_1',
        reviewerUserId: 'user_1',
      }),
    ).toThrow()
  })

  it('throws when a client session has no magicLinkId', () => {
    expect(() =>
      assertSessionKindInvariant({
        kind: 'client',
        magicLinkId: null,
        reviewerUserId: null,
      }),
    ).toThrow()
  })

  it('throws when an internal session also has a magicLinkId', () => {
    expect(() =>
      assertSessionKindInvariant({
        kind: 'internal',
        magicLinkId: 'ml_1',
        reviewerUserId: 'user_1',
      }),
    ).toThrow()
  })

  it('throws when an internal session has no reviewerUserId', () => {
    expect(() =>
      assertSessionKindInvariant({
        kind: 'internal',
        magicLinkId: null,
        reviewerUserId: null,
      }),
    ).toThrow()
  })
})
