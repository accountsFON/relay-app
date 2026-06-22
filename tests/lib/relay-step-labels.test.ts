import { describe, it, expect } from 'vitest'
import { RelayStep } from '@prisma/client'
import {
  RELAY_STEP_DESCRIPTIONS,
  RELAY_STEP_LABELS,
  relayStepDescription,
  relayStepLabel,
} from '@/lib/relay-step-labels'

describe('RELAY_STEP_LABELS', () => {
  it('has a label for every RelayStep enum value', () => {
    for (const step of Object.values(RelayStep)) {
      expect(RELAY_STEP_LABELS[step]).toBeTruthy()
      expect(typeof RELAY_STEP_LABELS[step]).toBe('string')
    }
  })

  it('uses the canonical step labels from the pipeline rework', () => {
    expect(RELAY_STEP_LABELS[RelayStep.onboarding_gate]).toBe('Onboarding')
    expect(RELAY_STEP_LABELS[RelayStep.in_design]).toBe('Initial Design')
    expect(RELAY_STEP_LABELS[RelayStep.am_review_design]).toBe('Design Review')
    expect(RELAY_STEP_LABELS[RelayStep.client_decision]).toBe('Client review')
    expect(RELAY_STEP_LABELS[RelayStep.sent_to_client]).toBe('Sent to client')
  })
})

describe('relayStepLabel', () => {
  it('returns the canonical label for known steps', () => {
    expect(relayStepLabel(RelayStep.copy)).toBe('Copy Review')
    expect(relayStepLabel(RelayStep.implementing_revisions)).toBe('Post Revision')
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

describe('RELAY_STEP_DESCRIPTIONS', () => {
  it('has a description for every RelayStep enum value', () => {
    for (const step of Object.values(RelayStep)) {
      expect(RELAY_STEP_DESCRIPTIONS[step]).toBeTruthy()
      expect(typeof RELAY_STEP_DESCRIPTIONS[step]).toBe('string')
    }
  })

  it('keeps every description under 80 characters', () => {
    for (const step of Object.values(RelayStep)) {
      expect(RELAY_STEP_DESCRIPTIONS[step].length).toBeLessThan(80)
    }
  })

  it('uses no em or en dashes anywhere', () => {
    for (const step of Object.values(RelayStep)) {
      expect(RELAY_STEP_DESCRIPTIONS[step]).not.toMatch(/[–—]/)
    }
  })
})

describe('relayStepDescription', () => {
  it('returns the canonical description for known steps', () => {
    expect(relayStepDescription(RelayStep.copy)).toBe('Captions are being drafted')
    expect(relayStepDescription(RelayStep.sent_to_client)).toBe(
      'Sent to the client for approval',
    )
    expect(relayStepDescription(RelayStep.am_review_design)).toBe(
      'AM is reviewing the designs before client send',
    )
  })

  it('returns an empty string for null or undefined', () => {
    expect(relayStepDescription(null)).toBe('')
    expect(relayStepDescription(undefined)).toBe('')
  })

  it('returns an empty string for unknown step strings', () => {
    expect(relayStepDescription('totally_unknown_step')).toBe('')
  })
})

describe('pipeline rework: labels', () => {
  it('renames the shared steps', () => {
    expect(RELAY_STEP_LABELS[RelayStep.onboarding_gate]).toBe('Onboarding')
    expect(RELAY_STEP_LABELS[RelayStep.copy]).toBe('Copy Review')
    expect(RELAY_STEP_LABELS[RelayStep.in_design]).toBe('Initial Design')
    expect(RELAY_STEP_LABELS[RelayStep.am_review_design]).toBe('Design Review')
    expect(RELAY_STEP_LABELS[RelayStep.design_revisions]).toBe('Design Revision')
    expect(RELAY_STEP_LABELS[RelayStep.implementing_revisions]).toBe('Post Revision')
    expect(RELAY_STEP_LABELS[RelayStep.client_review]).toBe('Client Review')
    expect(RELAY_STEP_LABELS[RelayStep.scheduling]).toBe('Scheduling')
  })
  it('QA label is dynamic by clientReviewEnabled', () => {
    expect(relayStepLabel(RelayStep.am_qa_pre_client, true)).toBe('Pre-Client QA')
    expect(relayStepLabel(RelayStep.am_qa_pre_client, false)).toBe('Final QA')
  })
  it('QA label defaults to Pre-Client QA when no flag given', () => {
    expect(relayStepLabel(RelayStep.am_qa_pre_client)).toBe('Pre-Client QA')
  })
})
