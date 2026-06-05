import { describe, it, expect } from 'vitest'
import { RelayStep } from '@prisma/client'
import { isRelayCelebrationStep } from '@/lib/relay-celebration'

describe('isRelayCelebrationStep', () => {
  it('is true only for the terminal completed step', () => {
    expect(isRelayCelebrationStep(RelayStep.completed)).toBe(true)
  })

  it('is false for final_qa_schedule (the last working step, not finished yet)', () => {
    // Regression guard: the celebration must fire AFTER the last step, not on
    // arrival at it. Gating on final_qa_schedule celebrates too early.
    expect(isRelayCelebrationStep(RelayStep.final_qa_schedule)).toBe(false)
  })

  it('is false for earlier steps', () => {
    expect(isRelayCelebrationStep(RelayStep.copy)).toBe(false)
    expect(isRelayCelebrationStep(RelayStep.ready_to_schedule)).toBe(false)
    expect(isRelayCelebrationStep(RelayStep.revisions_complete)).toBe(false)
  })
})
