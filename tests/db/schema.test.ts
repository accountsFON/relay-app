/**
 * Schema-level enum smoke test.
 *
 * Layer 0 of the post preview + feedback system adds 5 new ActivityKind
 * values. This test asserts they all resolve as valid enum values via the
 * generated Prisma client, which is the single source of truth for the
 * downstream typed code.
 */
import { describe, it, expect } from 'vitest'
import { ActivityKind } from '@prisma/client'

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
