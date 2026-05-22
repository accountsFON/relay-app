import { describe, it, expect } from 'vitest'
import { RelayStep } from '@prisma/client'
import {
  STEP_COLOR,
  getStepColor,
  type StepCategoryColor,
} from '@/lib/relay-step-colors'

const VALID_COLORS: ReadonlyArray<StepCategoryColor> = [
  'blue',
  'yellow',
  'coral',
  'ink',
]

describe('STEP_COLOR', () => {
  it('has a category color for every RelayStep enum value', () => {
    for (const step of Object.values(RelayStep)) {
      expect(STEP_COLOR[step]).toBeTruthy()
      expect(VALID_COLORS).toContain(STEP_COLOR[step])
    }
  })

  it('matches the explicit mockup mapping for the 5 known steps', () => {
    // From Mockup 1 (see 2026-05-22-brand-implementation-design.md).
    expect(STEP_COLOR[RelayStep.onboarding_gate]).toBe('blue')
    expect(STEP_COLOR[RelayStep.copy]).toBe('yellow')
    expect(STEP_COLOR[RelayStep.in_design]).toBe('coral')
    expect(STEP_COLOR[RelayStep.designs_completed]).toBe('coral')
    expect(STEP_COLOR[RelayStep.am_review_design]).toBe('yellow')
  })

  it('paints the completed step in ink so done relays read as resolved', () => {
    expect(STEP_COLOR[RelayStep.completed]).toBe('ink')
  })
})

describe('getStepColor', () => {
  it('returns the mapped color for known steps', () => {
    expect(getStepColor(RelayStep.copy)).toBe('yellow')
    expect(getStepColor(RelayStep.in_design)).toBe('coral')
    expect(getStepColor(RelayStep.sent_to_client)).toBe('blue')
  })

  it('falls back to blue for unknown step strings', () => {
    expect(getStepColor('legacy_freeform_state' as RelayStep)).toBe('blue')
  })

  it('falls back to blue for null or undefined', () => {
    expect(getStepColor(null)).toBe('blue')
    expect(getStepColor(undefined)).toBe('blue')
  })
})
