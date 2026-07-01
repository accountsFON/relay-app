import { describe, it, expect } from 'vitest'
import { RelayStep } from '@prisma/client'
import { isRelayLocked } from '@/lib/relay-lock'

describe('isRelayLocked', () => {
  it('is true only for the completed step', () => {
    expect(isRelayLocked(RelayStep.completed)).toBe(true)
  })
  it('is false for scheduling and other live steps', () => {
    expect(isRelayLocked(RelayStep.scheduling)).toBe(false)
    expect(isRelayLocked(RelayStep.copy)).toBe(false)
    expect(isRelayLocked(RelayStep.client_review)).toBe(false)
    expect(isRelayLocked(RelayStep.am_qa_pre_client)).toBe(false)
  })
})
