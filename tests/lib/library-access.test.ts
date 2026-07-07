import { describe, it, expect } from 'vitest'
import { canViewLibrary } from '@/lib/library-access'
import type { OrgContext } from '@/lib/types'

function ctx(role: OrgContext['role'], platformOwner = false): Pick<OrgContext, 'role' | 'platformOwner'> {
  return { role, platformOwner }
}

describe('canViewLibrary', () => {
  it('allows admin and account_manager (agency-internal QA index)', () => {
    expect(canViewLibrary(ctx('admin'))).toBe(true)
    expect(canViewLibrary(ctx('account_manager'))).toBe(true)
  })
  it('allows a platform owner regardless of role', () => {
    expect(canViewLibrary(ctx('designer', true))).toBe(true)
  })
  it('denies designer and client (P1 #15: designer library leak)', () => {
    expect(canViewLibrary(ctx('designer'))).toBe(false)
    expect(canViewLibrary(ctx('client'))).toBe(false)
  })
})
