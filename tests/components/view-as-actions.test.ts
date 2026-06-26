import { describe, it, expect, vi, beforeEach } from 'vitest'

const { cookieSet, cookieDelete } = vi.hoisted(() => ({
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
}))

vi.mock('@/server/middleware/permissions', () => ({ requireAdminPortal: vi.fn() }))
vi.mock('@/server/middleware/auth', () => ({ getOrgContext: vi.fn() }))
vi.mock('@/server/repositories/memberships', () => ({
  findMembership: vi.fn(),
  listImpersonationCandidates: vi.fn(),
}))
vi.mock('@/server/repositories/impersonationLogs', () => ({
  recordImpersonationStart: vi.fn(),
  recordImpersonationStop: vi.fn(),
}))
vi.mock('@/db/client', () => ({ db: { user: { findUnique: vi.fn() } } }))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ set: cookieSet, delete: cookieDelete }),
}))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('REDIRECT')
  }),
}))

import { requireAdminPortal } from '@/server/middleware/permissions'
import { getOrgContext } from '@/server/middleware/auth'
import { findMembership, listImpersonationCandidates } from '@/server/repositories/memberships'
import { recordImpersonationStart, recordImpersonationStop } from '@/server/repositories/impersonationLogs'
import { db } from '@/db/client'
import { startViewAs, stopViewAs, listImpersonationTargets } from '@/components/view-as-actions'
import { VIEW_AS_COOKIE } from '@/server/auth/impersonation'

const adminCtx = {
  userId: 'clerk_admin', orgId: 'clerk_org_1', role: 'admin', plan: 'smb',
  organizationDbId: 'org_1', userDbId: 'admin_1', avatarUrl: null,
  platformOwner: false, linkedClientId: null, permissionOverrides: null, roleDefaults: {},
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdminPortal).mockResolvedValue(adminCtx as never)
})

describe('startViewAs', () => {
  it('sets the cookie + logs start for an eligible target', async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({
      id: 'payton_1', organizationId: 'org_1', deactivatedAt: null, platformOwner: false,
    } as never)
    vi.mocked(findMembership).mockResolvedValue({ role: 'account_manager', organizationId: 'org_1' } as never)
    await expect(startViewAs('payton_1')).rejects.toThrow('REDIRECT')
    expect(cookieSet).toHaveBeenCalledWith(VIEW_AS_COOKIE, 'payton_1', expect.objectContaining({ httpOnly: true }))
    expect(recordImpersonationStart).toHaveBeenCalledWith({
      realActorId: 'admin_1', targetUserId: 'payton_1', organizationId: 'org_1',
    })
  })

  it('rejects an ineligible (admin) target without setting a cookie', async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({
      id: 'other_admin', organizationId: 'org_1', deactivatedAt: null, platformOwner: false,
    } as never)
    vi.mocked(findMembership).mockResolvedValue({ role: 'admin', organizationId: 'org_1' } as never)
    await expect(startViewAs('other_admin')).rejects.toThrow('Cannot view as this user')
    expect(cookieSet).not.toHaveBeenCalled()
    expect(recordImpersonationStart).not.toHaveBeenCalled()
  })
})

describe('stopViewAs', () => {
  it('logs stop with the real actor and clears the cookie', async () => {
    vi.mocked(getOrgContext).mockResolvedValue({
      ...adminCtx, userDbId: 'payton_1', role: 'account_manager',
      impersonation: { realUserId: 'admin_1', realUserName: 'A', targetUserName: 'Payton' },
    } as never)
    await expect(stopViewAs()).rejects.toThrow('REDIRECT')
    expect(recordImpersonationStop).toHaveBeenCalledWith({
      realActorId: 'admin_1', targetUserId: 'payton_1', organizationId: 'org_1',
    })
    expect(cookieDelete).toHaveBeenCalledWith(VIEW_AS_COOKIE)
  })

  it('clears the cookie even if there is no active impersonation', async () => {
    vi.mocked(getOrgContext).mockResolvedValue(adminCtx as never)
    await expect(stopViewAs()).rejects.toThrow('REDIRECT')
    expect(recordImpersonationStop).not.toHaveBeenCalled()
    expect(cookieDelete).toHaveBeenCalledWith(VIEW_AS_COOKIE)
  })
})

describe('listImpersonationTargets', () => {
  it('returns only eligible non-admin, non-platform-owner members', async () => {
    vi.mocked(listImpersonationCandidates).mockResolvedValue([
      { role: 'account_manager', organizationId: 'org_1', user: { id: 'payton_1', name: 'Payton', email: 'p@x.com', platformOwner: false } },
      { role: 'admin', organizationId: 'org_1', user: { id: 'a2', name: 'Admin2', email: 'a2@x.com', platformOwner: false } },
      { role: 'designer', organizationId: 'org_1', user: { id: 'po', name: 'PO', email: 'po@x.com', platformOwner: true } },
    ] as never)
    const out = await listImpersonationTargets()
    expect(out).toEqual([{ userId: 'payton_1', name: 'Payton', email: 'p@x.com', role: 'account_manager' }])
  })
})
