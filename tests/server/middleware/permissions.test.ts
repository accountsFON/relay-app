import { describe, it, expect } from 'vitest'
import type { UserRole } from '@/lib/types'
import {
  canEditClients,
  canViewClients,
} from '@/server/middleware/permissions'

describe('canEditClients', () => {
  it('returns true for admin', () => {
    expect(canEditClients('admin' as UserRole)).toBe(true)
  })

  it('returns true for account_manager', () => {
    expect(canEditClients('account_manager' as UserRole)).toBe(true)
  })

  it('returns false for designer', () => {
    expect(canEditClients('designer' as UserRole)).toBe(false)
  })

  it('returns false for client', () => {
    expect(canEditClients('client' as UserRole)).toBe(false)
  })
})

describe('canViewClients', () => {
  it('returns true for admin', () => {
    expect(canViewClients('admin' as UserRole)).toBe(true)
  })

  it('returns true for account_manager', () => {
    expect(canViewClients('account_manager' as UserRole)).toBe(true)
  })

  it('returns true for designer', () => {
    expect(canViewClients('designer' as UserRole)).toBe(true)
  })

  it('returns false for client', () => {
    expect(canViewClients('client' as UserRole)).toBe(false)
  })
})
