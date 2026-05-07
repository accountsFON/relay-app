import { describe, it, expect } from 'vitest'
import {
  can,
  describeOverrides,
  PERMISSION_KEYS,
  READ_ONLY_OVERRIDE,
  SYSTEM_DEFAULTS,
  type PermissionKey,
} from '@/server/auth/permissions'

describe('can() — system defaults', () => {
  it('admin has every permission by default', () => {
    for (const key of PERMISSION_KEYS) {
      expect(can({ role: 'admin' }, key)).toBe(true)
    }
  })

  it('AM has client.edit but not admin.portal', () => {
    expect(can({ role: 'account_manager' }, 'client.edit')).toBe(true)
    expect(can({ role: 'account_manager' }, 'admin.portal')).toBe(false)
  })

  it('designer is read-only', () => {
    expect(can({ role: 'designer' }, 'client.view')).toBe(true)
    expect(can({ role: 'designer' }, 'client.edit')).toBe(false)
    expect(can({ role: 'designer' }, 'post.edit')).toBe(false)
    expect(can({ role: 'designer' }, 'generation.trigger')).toBe(false)
    expect(can({ role: 'designer' }, 'run.delete')).toBe(false)
  })

  it('client only views their own surfaces', () => {
    expect(can({ role: 'client' }, 'client.view')).toBe(true)
    expect(can({ role: 'client' }, 'client.edit')).toBe(false)
    expect(can({ role: 'client' }, 'post.view')).toBe(true)
    expect(can({ role: 'client' }, 'post.edit')).toBe(false)
    expect(can({ role: 'client' }, 'admin.portal')).toBe(false)
  })
})

describe('can() — resolution priority', () => {
  it('user override beats org role default beats system default', () => {
    // System default: AM → client.edit = allow.
    // Org role default: AM → client.edit = deny (overrides system).
    // User override: client.edit = allow (overrides org default).
    const ctx = {
      role: 'account_manager' as const,
      permissionOverrides: { 'client.edit': true },
      roleDefaults: {
        account_manager: { 'client.edit': false },
      },
    }
    expect(can(ctx, 'client.edit')).toBe(true)
  })

  it('org role default beats system default when no user override', () => {
    const ctx = {
      role: 'designer' as const,
      permissionOverrides: null,
      roleDefaults: {
        designer: { 'post.edit': true }, // system says false, org says true
      },
    }
    expect(can(ctx, 'post.edit')).toBe(true)
  })

  it('falls through to system default when no overrides set', () => {
    expect(can({ role: 'admin' }, 'team.manage')).toBe(true)
    expect(can({ role: 'designer' }, 'team.manage')).toBe(false)
  })

  it('a per-user deny override neuters an AM into read-only', () => {
    const ctx = {
      role: 'account_manager' as const,
      permissionOverrides: { ...READ_ONLY_OVERRIDE },
    }
    expect(can(ctx, 'client.view')).toBe(true) // not in override, role default
    expect(can(ctx, 'client.edit')).toBe(false)
    expect(can(ctx, 'post.edit')).toBe(false)
    expect(can(ctx, 'generation.trigger')).toBe(false)
    expect(can(ctx, 'run.delete')).toBe(false)
  })
})

describe('describeOverrides()', () => {
  it('flags only the overridden keys', () => {
    const rows = describeOverrides(
      'account_manager',
      { 'client.edit': false },
      null,
    )
    const editRow = rows.find((r) => r.key === 'client.edit')
    const viewRow = rows.find((r) => r.key === 'client.view')
    expect(editRow?.isOverride).toBe(true)
    expect(editRow?.current).toBe(false)
    expect(viewRow?.isOverride).toBe(false)
    expect(viewRow?.current).toBe(true)
  })
})

describe('SYSTEM_DEFAULTS shape', () => {
  it('every role has every permission key', () => {
    for (const role of ['admin', 'account_manager', 'designer', 'client'] as const) {
      for (const key of PERMISSION_KEYS) {
        const v = SYSTEM_DEFAULTS[role][key as PermissionKey]
        expect(typeof v).toBe('boolean')
      }
    }
  })

  it('only admin has admin.portal by default', () => {
    expect(SYSTEM_DEFAULTS.admin['admin.portal']).toBe(true)
    expect(SYSTEM_DEFAULTS.account_manager['admin.portal']).toBe(false)
    expect(SYSTEM_DEFAULTS.designer['admin.portal']).toBe(false)
    expect(SYSTEM_DEFAULTS.client['admin.portal']).toBe(false)
  })
})
