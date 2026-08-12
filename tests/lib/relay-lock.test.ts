import { describe, it, expect, afterEach } from 'vitest'
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

describe('isRelayLocked with RELAY_COMPLETED_LOCK_DISABLED', () => {
  afterEach(() => {
    delete process.env.RELAY_COMPLETED_LOCK_DISABLED
  })

  it('makes the lock dormant when set to "true"', () => {
    process.env.RELAY_COMPLETED_LOCK_DISABLED = 'true'
    expect(isRelayLocked(RelayStep.completed)).toBe(false)
  })

  it('keeps the lock for any other value', () => {
    process.env.RELAY_COMPLETED_LOCK_DISABLED = '1'
    expect(isRelayLocked(RelayStep.completed)).toBe(true)
    process.env.RELAY_COMPLETED_LOCK_DISABLED = 'false'
    expect(isRelayLocked(RelayStep.completed)).toBe(true)
  })
})
