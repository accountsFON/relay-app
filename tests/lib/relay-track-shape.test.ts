import { describe, it, expect } from 'vitest'
import { RelayStep } from '@prisma/client'
import { FULL_TRACK, NO_REVIEW_TRACK, relayTrackFor } from '@/lib/relay-track-shape'

describe('relay-track-shape', () => {
  it('FULL_TRACK has 13 nodes (completed step is rendered separately)', () => {
    expect(FULL_TRACK).toHaveLength(13)
    expect(FULL_TRACK[0]).toBe(RelayStep.onboarding_gate)
    expect(FULL_TRACK).toContain(RelayStep.sent_to_client)
    expect(FULL_TRACK).toContain(RelayStep.client_decision)
    expect(FULL_TRACK).toContain(RelayStep.implementing_revisions)
    expect(FULL_TRACK).toContain(RelayStep.revisions_complete)
    expect(FULL_TRACK[FULL_TRACK.length - 1]).toBe(RelayStep.final_qa_schedule)
  })

  it('NO_REVIEW_TRACK has 9 nodes and drops the four client steps', () => {
    expect(NO_REVIEW_TRACK).toHaveLength(9)
    expect(NO_REVIEW_TRACK).not.toContain(RelayStep.sent_to_client)
    expect(NO_REVIEW_TRACK).not.toContain(RelayStep.client_decision)
    expect(NO_REVIEW_TRACK).not.toContain(RelayStep.implementing_revisions)
    expect(NO_REVIEW_TRACK).not.toContain(RelayStep.revisions_complete)
    expect(NO_REVIEW_TRACK[NO_REVIEW_TRACK.length - 1]).toBe(RelayStep.final_qa_schedule)
  })

  it('relayTrackFor picks the right array', () => {
    expect(relayTrackFor(true)).toBe(FULL_TRACK)
    expect(relayTrackFor(false)).toBe(NO_REVIEW_TRACK)
  })
})
