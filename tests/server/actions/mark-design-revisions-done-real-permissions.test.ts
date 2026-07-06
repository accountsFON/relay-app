/**
 * C1 ship-blocker regression (2026-06-29).
 *
 * The other action tests (tests/server/actions/relay.test.ts) mock
 * `@/server/middleware/permissions` as a bare `vi.fn()` and force `requireCan`
 * to resolve, which MASKS the real permission gate. That hid the C1 bug:
 * `markDesignRevisionsDoneAction` gated on `requireCan('relay.sendBack')`, but
 * `SYSTEM_DEFAULTS.designer['relay.sendBack'] === false`, so the assigned
 * designer (the role this feature is FOR) was redirected to /no-access before
 * the in-body `isAssignedDesigner || isHolder || canOverrideHolder` check ran.
 *
 * This file deliberately does NOT mock `@/server/middleware/permissions`. It
 * exercises the REAL `requireCan` + REAL `can()` against the REAL
 * `SYSTEM_DEFAULTS` matrix, stubbing only:
 *   - `requireOrgContext` (auth) to inject the identity/role under test, and
 *   - `next/navigation`'s `redirect` to detect the /no-access redirect.
 *
 * Net: the assigned designer is permitted, while an unassigned designer / a
 * client / a random user is rejected (fail-closed).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { OrgContext, UserRole } from '@/lib/types'
import { SYSTEM_DEFAULTS } from '@/server/auth/permissions'

// REAL requireCan + REAL can() run; we only control identity + redirect.
vi.mock('@/server/middleware/auth', () => ({
  requireOrgContext: vi.fn(),
}))

// redirect() normally throws a Next.js control-flow error. Make it throw a
// recognizable error so "redirected to /no-access" is assertable as a reject.
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`)
  }),
}))

vi.mock('@/server/services/relay', () => ({
  passBaton: vi.fn(),
  sendBackBaton: vi.fn(),
  finishBatch: vi.fn(),
  forceStep: vi.fn(),
  requestDesignChanges: vi.fn(),
  markDesignRevisionsDone: vi.fn(),
}))

vi.mock('@/server/services/activity', () => ({
  recordActivity: vi.fn(),
}))

vi.mock('@/server/repositories/threads', () => ({
  bulkResolveOnPost: vi.fn(),
}))

vi.mock('@/db/client', () => ({
  db: {
    batch: { findUnique: vi.fn() },
    postThread: { count: vi.fn() },
  },
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { db } from '@/db/client'
import { requireOrgContext } from '@/server/middleware/auth'
import { markDesignRevisionsDone } from '@/server/services/relay'
import { markDesignRevisionsDoneAction } from '@/server/actions/relay'

function makeCtx(role: UserRole, overrides: Partial<OrgContext> = {}): OrgContext {
  return {
    userId: 'clerk_user',
    orgId: 'clerk_org',
    role,
    plan: 'agency',
    organizationDbId: 'org_1',
    userDbId: 'u_actor',
    avatarUrl: null,
    platformOwner: false,
    linkedClientId: null,
    permissionOverrides: null,
    roleDefaults: {},
    ...overrides,
  }
}

function mockBatchWithDesigner(
  designerId: string | null,
  currentHolder = 'u_am',
  organizationId = 'org_1',
) {
  vi.mocked(db.batch.findUnique).mockResolvedValue({
    currentHolder,
    clientId: 'c1',
    client: { organizationId, assignedDesignerId: designerId },
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(markDesignRevisionsDone).mockResolvedValue({
    batchId: 'b1',
    subState: null,
  })
  vi.mocked(db.postThread.count).mockResolvedValue(0)
})

describe('SYSTEM_DEFAULTS guard for the C1 gate change', () => {
  // The whole point of switching the pre-gate from relay.sendBack to
  // relay.pass: designers HAVE relay.pass but NOT relay.sendBack.
  it('designer has relay.pass but not relay.sendBack', () => {
    expect(SYSTEM_DEFAULTS.designer['relay.pass']).toBe(true)
    expect(SYSTEM_DEFAULTS.designer['relay.sendBack']).toBe(false)
  })

  it('client does not have relay.pass... wait, client DOES — body must reject it', () => {
    // client HAS relay.pass by default (they advance their own review), so the
    // pre-gate alone does not stop a client. The in-body authorization
    // (isAssignedDesigner || isHolder || canOverrideHolder) is what rejects a
    // client here. Documented so the two-layer design stays intentional.
    expect(SYSTEM_DEFAULTS.client['relay.pass']).toBe(true)
    expect(SYSTEM_DEFAULTS.client['relay.sendBack']).toBe(false)
  })
})

describe('markDesignRevisionsDoneAction — REAL permission defaults', () => {
  it('the ASSIGNED designer passes the real relay.pass gate AND body auth', async () => {
    vi.mocked(requireOrgContext).mockResolvedValue(makeCtx('designer'))
    mockBatchWithDesigner('u_actor') // actor IS the assigned designer

    await markDesignRevisionsDoneAction({ batchId: 'b1' })

    expect(markDesignRevisionsDone).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId: 'b1',
        actorId: 'u_actor',
        actorOrganizationId: 'org_1',
      }),
    )
  })

  it('an UNASSIGNED designer clears the gate but is rejected by body auth', async () => {
    vi.mocked(requireOrgContext).mockResolvedValue(makeCtx('designer'))
    mockBatchWithDesigner('u_other_designer', 'u_am') // actor not assigned, not holder

    await expect(
      markDesignRevisionsDoneAction({ batchId: 'b1' }),
    ).rejects.toThrow(/assigned designer, an AM, or an admin/i)
    expect(markDesignRevisionsDone).not.toHaveBeenCalled()
  })

  it('a CLIENT is rejected by body auth (not assigned, not holder, no override)', async () => {
    vi.mocked(requireOrgContext).mockResolvedValue(makeCtx('client'))
    mockBatchWithDesigner('u_other_designer', 'u_am')

    await expect(
      markDesignRevisionsDoneAction({ batchId: 'b1' }),
    ).rejects.toThrow(/assigned designer, an AM, or an admin/i)
    expect(markDesignRevisionsDone).not.toHaveBeenCalled()
  })

  it('a random non-assigned designer who is also not the holder is rejected', async () => {
    vi.mocked(requireOrgContext).mockResolvedValue(
      makeCtx('designer', { userDbId: 'u_random' }),
    )
    mockBatchWithDesigner('u_other_designer', 'u_am')

    await expect(
      markDesignRevisionsDoneAction({ batchId: 'b1' }),
    ).rejects.toThrow(/assigned designer, an AM, or an admin/i)
    expect(markDesignRevisionsDone).not.toHaveBeenCalled()
  })

  it('an AM (real relay.pass=true) overrides via canOverrideHolder and passes', async () => {
    vi.mocked(requireOrgContext).mockResolvedValue(makeCtx('account_manager'))
    mockBatchWithDesigner('u_other_designer', 'u_someone_else')

    await markDesignRevisionsDoneAction({ batchId: 'b1' })

    expect(markDesignRevisionsDone).toHaveBeenCalledOnce()
  })
})
