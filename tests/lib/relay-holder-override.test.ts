import { describe, it, expect } from 'vitest'
import { canOverrideHolder } from '@/lib/relay-holder-override'

describe('canOverrideHolder', () => {
  it('admin can override', () => {
    expect(canOverrideHolder('admin', false)).toBe(true)
  })

  it('account_manager can override', () => {
    expect(canOverrideHolder('account_manager', false)).toBe(true)
  })

  it('designer cannot override', () => {
    expect(canOverrideHolder('designer', false)).toBe(false)
  })

  it('client cannot override', () => {
    expect(canOverrideHolder('client', false)).toBe(false)
  })

  it('platformOwner always overrides regardless of role', () => {
    expect(canOverrideHolder('designer', true)).toBe(true)
    expect(canOverrideHolder('client', true)).toBe(true)
    expect(canOverrideHolder('admin', true)).toBe(true)
  })
})
