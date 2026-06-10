import { describe, it, expect } from 'vitest'
import { isArchiveViewer } from '@/lib/archive-access'
import type { OrgContext } from '@/lib/types'

function ctx(role: OrgContext['role'], platformOwner = false): Pick<OrgContext, 'role' | 'platformOwner'> {
  return { role, platformOwner }
}

describe('isArchiveViewer', () => {
  it('allows admin and account_manager', () => {
    expect(isArchiveViewer(ctx('admin'))).toBe(true)
    expect(isArchiveViewer(ctx('account_manager'))).toBe(true)
  })
  it('allows a platform owner regardless of role', () => {
    expect(isArchiveViewer(ctx('designer', true))).toBe(true)
  })
  it('denies designer and client', () => {
    expect(isArchiveViewer(ctx('designer'))).toBe(false)
    expect(isArchiveViewer(ctx('client'))).toBe(false)
  })
})
