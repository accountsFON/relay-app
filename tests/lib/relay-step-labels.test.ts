import { describe, it, expect } from 'vitest'
import { RelayStep } from '@prisma/client'
import { RELAY_STEP_LABELS, relayStepLabel } from '@/lib/relay-step-labels'

describe('RELAY_STEP_LABELS', () => {
  it('has a label for every RelayStep enum value', () => {
    for (const step of Object.values(RelayStep)) {
      expect(RELAY_STEP_LABELS[step]).toBeTruthy()
      expect(typeof RELAY_STEP_LABELS[step]).toBe('string')
    }
  })

  it('uses the canonical step labels from the notifications audit', () => {
    expect(RELAY_STEP_LABELS[RelayStep.onboarding_gate]).toBe('Onboarding')
    expect(RELAY_STEP_LABELS[RelayStep.in_design]).toBe('Design')
    expect(RELAY_STEP_LABELS[RelayStep.am_review_design]).toBe('AM review (design)')
    expect(RELAY_STEP_LABELS[RelayStep.client_decision]).toBe('Client review')
    expect(RELAY_STEP_LABELS[RelayStep.sent_to_client]).toBe('Sent to client')
  })
})

describe('relayStepLabel', () => {
  it('returns the canonical label for known steps', () => {
    expect(relayStepLabel(RelayStep.copy)).toBe('Copy')
    expect(relayStepLabel(RelayStep.implementing_revisions)).toBe(
      'Client revisions in progress',
    )
  })

  it('returns an empty string for null or undefined', () => {
    expect(relayStepLabel(null)).toBe('')
    expect(relayStepLabel(undefined)).toBe('')
  })

  it('falls back to a humanized form when given an unknown sub-state string', () => {
    expect(relayStepLabel('legacy_freeform_state')).toBe('legacy freeform state')
  })

  it('never returns a raw underscore-delimited enum key for known steps', () => {
    for (const step of Object.values(RelayStep)) {
      expect(relayStepLabel(step)).not.toMatch(/_/)
    }
  })
})
