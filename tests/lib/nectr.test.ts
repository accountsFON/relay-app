import { describe, it, expect } from 'vitest'
import { nectrConnectUrl } from '@/lib/nectr'

describe('nectrConnectUrl', () => {
  it('builds the sub-account social-planner URL from a location id', () => {
    expect(nectrConnectUrl('LOC123')).toBe('https://app.nectrcrm.com/v2/location/LOC123/marketing/social-planner')
  })
})
