/**
 * Schema-level enum smoke test.
 *
 * Layer 0 of the post preview + feedback system adds 5 new ActivityKind
 * values. v2 of the client review session redesign adds 5 more, plus the
 * `ReviewDecision` and `ReviewSessionStatus` enums.
 *
 * This test asserts they all resolve as valid enum values via the generated
 * Prisma client, which is the single source of truth for the downstream
 * typed code.
 */
import { describe, it, expect } from 'vitest'
import { ActivityKind, ReviewDecision, ReviewSessionStatus } from '@prisma/client'

describe('ActivityKind enum (preview + feedback system)', () => {
  it.each([
    'post_thread_opened',
    'post_thread_resolved',
    'post_caption_ai_fixed',
    'magic_link_created',
    'magic_link_visited',
  ] as const)('exposes %s', (value) => {
    // Generated Prisma client exports enums as objects whose own keys equal
    // their values. If any value is missing from the generated client, the
    // schema is out of sync with the migration.
    expect(ActivityKind[value as keyof typeof ActivityKind]).toBe(value)
  })
})

describe('ActivityKind enum (v2 review session)', () => {
  it.each([
    'review_session_started',
    'review_session_submitted',
    'review_caption_edit_accepted',
    'review_item_addressed',
    'review_round_started',
  ] as const)('exposes %s', (value) => {
    expect(ActivityKind[value as keyof typeof ActivityKind]).toBe(value)
  })
})

describe('ReviewDecision enum', () => {
  it.each([
    'not_reviewed',
    'approved',
    'changes_requested',
    'caption_edited',
  ] as const)('exposes %s', (value) => {
    expect(ReviewDecision[value as keyof typeof ReviewDecision]).toBe(value)
  })
})

describe('ReviewSessionStatus enum', () => {
  it.each(['in_progress', 'submitted', 'superseded'] as const)(
    'exposes %s',
    (value) => {
      expect(
        ReviewSessionStatus[value as keyof typeof ReviewSessionStatus]
      ).toBe(value)
    }
  )
})
