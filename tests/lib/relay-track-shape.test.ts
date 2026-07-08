import { describe, it, expect } from 'vitest'
import { RelayStep } from '@prisma/client'
import { FULL_TRACK, NO_REVIEW_TRACK, relayTrackFor } from '@/lib/relay-track-shape'

describe('relay-track-shape', () => {
  it('FULL_TRACK has 6 live nodes (am_qa_pre_client retired 2026-07-08, onboarding_gate 2026-07-01, design_revisions 2026-06-26)', () => {
    // 2026-06-22 rework merged the client + schedule steps. Merge design steps
    // (2026-06-26) retires design_revisions: Design Review is now one AM-held
    // step. Onboarding move (2026-07-01) retires onboarding_gate: relays now
    // start at Copy Review. Pre-Client QA removal (P1 #13, 2026-07-08) retires
    // am_qa_pre_client: Design Review advances straight to Client Review. The
    // retired steps must NOT be in the track or relay-track.tsx's
    // indexOf(currentStep) returns -1 and the timeline blanks.
    expect(FULL_TRACK).toHaveLength(6)
    expect(FULL_TRACK[0]).toBe(RelayStep.copy)
    expect(FULL_TRACK).toContain(RelayStep.in_design)
    expect(FULL_TRACK).toContain(RelayStep.am_review_design)
    expect(FULL_TRACK).toContain(RelayStep.client_review)
    expect(FULL_TRACK).toContain(RelayStep.implementing_revisions)
    expect(FULL_TRACK[FULL_TRACK.length - 1]).toBe(RelayStep.scheduling)
    // Retired steps stay out of the live track.
    expect(FULL_TRACK).not.toContain(RelayStep.am_qa_pre_client)
    expect(FULL_TRACK).not.toContain(RelayStep.onboarding_gate)
    expect(FULL_TRACK).not.toContain(RelayStep.design_revisions)
    expect(FULL_TRACK).not.toContain(RelayStep.sent_to_client)
    expect(FULL_TRACK).not.toContain(RelayStep.client_decision)
    expect(FULL_TRACK).not.toContain(RelayStep.ready_to_schedule)
    expect(FULL_TRACK).not.toContain(RelayStep.revisions_complete)
    expect(FULL_TRACK).not.toContain(RelayStep.final_qa_schedule)
    expect(FULL_TRACK).not.toContain(RelayStep.designs_completed)
  })

  it('NO_REVIEW_TRACK has 4 live nodes and drops the client steps + retired steps', () => {
    expect(NO_REVIEW_TRACK).toHaveLength(4)
    expect(NO_REVIEW_TRACK[0]).toBe(RelayStep.copy)
    expect(NO_REVIEW_TRACK).toContain(RelayStep.in_design)
    expect(NO_REVIEW_TRACK).toContain(RelayStep.am_review_design)
    expect(NO_REVIEW_TRACK[NO_REVIEW_TRACK.length - 1]).toBe(RelayStep.scheduling)
    // No client review => no client_review and no client-requested post revision.
    expect(NO_REVIEW_TRACK).not.toContain(RelayStep.client_review)
    expect(NO_REVIEW_TRACK).not.toContain(RelayStep.implementing_revisions)
    // Retired steps stay out.
    expect(NO_REVIEW_TRACK).not.toContain(RelayStep.am_qa_pre_client)
    expect(NO_REVIEW_TRACK).not.toContain(RelayStep.onboarding_gate)
    expect(NO_REVIEW_TRACK).not.toContain(RelayStep.design_revisions)
    expect(NO_REVIEW_TRACK).not.toContain(RelayStep.sent_to_client)
    expect(NO_REVIEW_TRACK).not.toContain(RelayStep.client_decision)
    expect(NO_REVIEW_TRACK).not.toContain(RelayStep.ready_to_schedule)
    expect(NO_REVIEW_TRACK).not.toContain(RelayStep.final_qa_schedule)
    expect(NO_REVIEW_TRACK).not.toContain(RelayStep.designs_completed)
  })

  it('every live step resolves to a real index (no -1 blanking)', () => {
    // The bug was indexOf(currentStep) === -1 for client_review / scheduling.
    for (const step of FULL_TRACK) {
      expect(FULL_TRACK.indexOf(step)).toBeGreaterThanOrEqual(0)
    }
    expect(FULL_TRACK.indexOf(RelayStep.client_review)).toBeGreaterThanOrEqual(0)
    expect(FULL_TRACK.indexOf(RelayStep.scheduling)).toBeGreaterThanOrEqual(0)
  })

  it('relayTrackFor picks the right array', () => {
    expect(relayTrackFor(true)).toBe(FULL_TRACK)
    expect(relayTrackFor(false)).toBe(NO_REVIEW_TRACK)
  })
})

describe('relay track shape — onboarding_gate retired', () => {
  it('FULL_TRACK starts at copy and omits onboarding_gate', () => {
    expect(FULL_TRACK).not.toContain(RelayStep.onboarding_gate)
    expect(FULL_TRACK[0]).toBe(RelayStep.copy)
    expect(FULL_TRACK).toHaveLength(6)
  })
  it('NO_REVIEW_TRACK starts at copy and omits onboarding_gate', () => {
    expect(NO_REVIEW_TRACK).not.toContain(RelayStep.onboarding_gate)
    expect(NO_REVIEW_TRACK[0]).toBe(RelayStep.copy)
    expect(NO_REVIEW_TRACK).toHaveLength(4)
  })
  it('relayTrackFor still switches on clientReviewEnabled', () => {
    expect(relayTrackFor(true)).toBe(FULL_TRACK)
    expect(relayTrackFor(false)).toBe(NO_REVIEW_TRACK)
  })
})
