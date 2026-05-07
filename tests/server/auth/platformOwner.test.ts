import { describe, it, expect } from 'vitest'
import { can, PERMISSION_KEYS } from '@/server/auth/permissions'

describe('platform-owner short-circuit in can()', () => {
  it('grants every permission when platformOwner=true regardless of role', () => {
    for (const key of PERMISSION_KEYS) {
      expect(can({ role: 'designer', platformOwner: true }, key)).toBe(true)
    }
  })

  it('still denies when platformOwner=false (or omitted)', () => {
    expect(can({ role: 'designer' }, 'client.edit')).toBe(false)
    expect(can({ role: 'designer', platformOwner: false }, 'client.edit')).toBe(false)
  })

  it('platformOwner=true overrides explicit Deny in permissionOverrides', () => {
    expect(
      can(
        {
          role: 'admin',
          platformOwner: true,
          permissionOverrides: { 'admin.portal': false },
        },
        'admin.portal',
      ),
    ).toBe(true)
  })
})
