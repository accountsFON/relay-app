# NECTR Auto-Scheduling Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each client a configurable, verifiable connection to its NECTR (white-labeled GoHighLevel) Social Planner, without posting anything yet.

**Architecture:** Mirror the PR #425 Drive integration. A shared agency token lives in env (`NECTR_AGENCY_TOKEN`), read in exactly one place inside a thin API wrapper (`src/lib/nectr-social.ts`). The only per-client value is a non-secret `nectrLocationId` stored plaintext on `Client`, exactly like `assetsFolderUrl`. A read-only server action verifies the connection and a "Test connection" button on the client profile shows which social accounts are linked and healthy.

**Tech Stack:** Next.js 16, Prisma 7, Postgres (Neon), Zod, React, vitest + @testing-library/react. NECTR API is plain HTTPS (`fetch`), no SDK.

## Global Constraints

- **Additive, nullable migration only:** one column `Client.nectrLocationId` (`TEXT`, nullable). The migration SQL must match `schema.prisma` exactly or the `schema-drift` CI guard fails.
- **No posting in this phase.** Every NECTR call is a GET (read-only). Phase 1 cannot affect any client's live social accounts.
- **Credential model:** shared agency token in env var `NECTR_AGENCY_TOKEN`; per-client `nectrLocationId` plaintext. The token is read in ONE function only (`getAgencyToken`).
- **NECTR API:** base `https://services.leadconnectorhq.com`, request header `Version: 2021-07-28`, `Authorization: Bearer <token>`.
- **Tests:** vitest, `@testing-library/react`, `@/` path alias. Follow existing patterns in `tests/lib/*` and `tests/app/clients/*`.
- **Green gate before the PR:** `npx tsc --noEmit`, the unit suite, `next build`, and `eslint` all clean. One PR into `main`.
- **No pipeline redeploy:** no change under `src/server/jobs/**`, so the Trigger.dev deploy job stays skipped.

---

### Task 1: NECTR Social API wrapper (`src/lib/nectr-social.ts`)

The thin, injectable read wrapper. Mirrors `src/lib/google-drive.ts`: the credential is read in one place, a typed config error is thrown when it is missing, and every network call is unit-testable through an injected `fetchImpl`.

**Files:**
- Create: `src/lib/nectr-social.ts`
- Test: `tests/lib/nectr-social.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces (later tasks rely on these exact names/types):
  - `class NectrConfigError extends Error`
  - `class NectrApiError extends Error { status: number }`
  - `interface NectrAccount { id: string; platform: string; name: string; type: string; isExpired: boolean }`
  - `interface NectrUser { id: string; name: string; email: string | null; role: string | null }`
  - `type NectrConnectionStatus = { status: 'no-location' } | { status: 'not-configured' } | { status: 'error'; message: string } | { status: 'ok'; accounts: NectrAccount[]; serviceUserId: string | null }`
  - `function getAgencyToken(): string`
  - `function getAccounts(locationId: string, deps?: { fetchImpl?: typeof fetch; token?: string }): Promise<NectrAccount[]>`
  - `function getUsers(locationId: string, deps?: { fetchImpl?: typeof fetch; token?: string }): Promise<NectrUser[]>`
  - `function pickServiceUserId(users: NectrUser[]): string | null`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/nectr-social.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  getAgencyToken,
  getAccounts,
  getUsers,
  pickServiceUserId,
  NectrConfigError,
  NectrApiError,
} from '@/lib/nectr-social'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

describe('getAgencyToken', () => {
  it('returns the trimmed token when set', () => {
    vi.stubEnv('NECTR_AGENCY_TOKEN', '  pit-abc  ')
    expect(getAgencyToken()).toBe('pit-abc')
  })

  it('throws NectrConfigError when unset or blank', () => {
    vi.stubEnv('NECTR_AGENCY_TOKEN', '')
    expect(() => getAgencyToken()).toThrow(NectrConfigError)
  })
})

describe('getAccounts', () => {
  it('parses the NECTR account shape including platform and isExpired', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        results: {
          accounts: [
            { id: 'acc_fb', platform: 'facebook', name: 'Five One Nine', type: 'page', isExpired: false },
            { id: 'acc_ig', platform: 'instagram', name: 'fiveonenine', type: 'profile', isExpired: true },
          ],
        },
      }),
    ) as unknown as typeof fetch

    const accounts = await getAccounts('loc1', { fetchImpl, token: 't' })

    expect(accounts).toEqual([
      { id: 'acc_fb', platform: 'facebook', name: 'Five One Nine', type: 'page', isExpired: false },
      { id: 'acc_ig', platform: 'instagram', name: 'fiveonenine', type: 'profile', isExpired: true },
    ])
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://services.leadconnectorhq.com/social-media-posting/loc1/accounts',
      expect.objectContaining({
        headers: expect.objectContaining({ Version: '2021-07-28', Authorization: 'Bearer t' }),
      }),
    )
  })

  it('returns [] when NECTR returns no accounts block', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ results: {} })) as unknown as typeof fetch
    expect(await getAccounts('loc1', { fetchImpl, token: 't' })).toEqual([])
  })

  it('throws NectrApiError with the status on a non-2xx response', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 403)) as unknown as typeof fetch
    await expect(getAccounts('loc1', { fetchImpl, token: 't' })).rejects.toBeInstanceOf(NectrApiError)
    await expect(getAccounts('loc1', { fetchImpl, token: 't' })).rejects.toMatchObject({ status: 403 })
  })
})

describe('getUsers', () => {
  it('parses users including the nested role', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        users: [
          { id: 'u_admin', name: 'Julio Aleman', email: 'julio@x.com', roles: { role: 'admin' } },
          { id: 'u_user', name: 'Maelee', email: 'maelee@x.com', roles: { role: 'user' } },
        ],
      }),
    ) as unknown as typeof fetch

    const users = await getUsers('loc1', { fetchImpl, token: 't' })

    expect(users).toEqual([
      { id: 'u_admin', name: 'Julio Aleman', email: 'julio@x.com', role: 'admin' },
      { id: 'u_user', name: 'Maelee', email: 'maelee@x.com', role: 'user' },
    ])
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://services.leadconnectorhq.com/users/?locationId=loc1',
      expect.objectContaining({ headers: expect.objectContaining({ Version: '2021-07-28' }) }),
    )
  })
})

describe('pickServiceUserId', () => {
  it('prefers an admin', () => {
    expect(
      pickServiceUserId([
        { id: 'u1', name: 'A', email: null, role: 'user' },
        { id: 'u2', name: 'B', email: null, role: 'admin' },
      ]),
    ).toBe('u2')
  })

  it('falls back to the first user when no admin', () => {
    expect(
      pickServiceUserId([{ id: 'u1', name: 'A', email: null, role: 'user' }]),
    ).toBe('u1')
  })

  it('returns null for an empty list', () => {
    expect(pickServiceUserId([])).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/nectr-social.test.ts`
Expected: FAIL — cannot resolve `@/lib/nectr-social` (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/lib/nectr-social.ts`:

```ts
/**
 * Thin, read-only wrapper around the NECTR (white-labeled GoHighLevel) Social
 * Planner API for the auto-scheduling feature (Phase 1: connection + health).
 *
 * Design mirrors src/lib/google-drive.ts: the shared credential is read in ONE
 * place (`getAgencyToken`), a typed error is thrown when it is missing, and
 * every network call takes an injectable `fetchImpl` + `token` so the logic is
 * unit-testable with no network and no env.
 *
 * Spec: docs/superpowers/specs/2026-08-12-nectr-auto-scheduling-phase1-design.md
 */

export const NECTR_API_BASE = 'https://services.leadconnectorhq.com'
const NECTR_API_VERSION = '2021-07-28'

/** Thrown when the shared agency token env is missing. */
export class NectrConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NectrConfigError'
  }
}

/** Thrown when the NECTR API returns a non-2xx response. */
export class NectrApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'NectrApiError'
    this.status = status
  }
}

export interface NectrAccount {
  id: string
  platform: string
  name: string
  type: string
  isExpired: boolean
}

export interface NectrUser {
  id: string
  name: string
  email: string | null
  role: string | null
}

export type NectrConnectionStatus =
  | { status: 'no-location' }
  | { status: 'not-configured' }
  | { status: 'error'; message: string }
  | { status: 'ok'; accounts: NectrAccount[]; serviceUserId: string | null }

interface NectrDeps {
  fetchImpl?: typeof fetch
  token?: string
}

/** The ONLY read site of the shared agency token. Throws if unset. */
export function getAgencyToken(): string {
  const raw = process.env.NECTR_AGENCY_TOKEN
  if (!raw || !raw.trim()) {
    throw new NectrConfigError('NECTR_AGENCY_TOKEN is not set')
  }
  return raw.trim()
}

async function nectrGet(path: string, deps?: NectrDeps): Promise<unknown> {
  const token = deps?.token ?? getAgencyToken()
  const fetchImpl = deps?.fetchImpl ?? fetch
  const res = await fetchImpl(`${NECTR_API_BASE}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Version: NECTR_API_VERSION,
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    let message = `NECTR API ${res.status}`
    try {
      const body = await res.text()
      if (body) message = `${message}: ${body.slice(0, 300)}`
    } catch {
      // ignore body read failures; the status is enough
    }
    throw new NectrApiError(res.status, message)
  }
  return res.json()
}

export async function getAccounts(locationId: string, deps?: NectrDeps): Promise<NectrAccount[]> {
  const json = (await nectrGet(`/social-media-posting/${locationId}/accounts`, deps)) as {
    results?: { accounts?: Array<Record<string, unknown>> }
  }
  const raw = json.results?.accounts ?? []
  return raw.map((a) => ({
    id: String(a.id ?? ''),
    platform: String(a.platform ?? ''),
    name: String(a.name ?? ''),
    type: String(a.type ?? ''),
    isExpired: Boolean(a.isExpired),
  }))
}

export async function getUsers(locationId: string, deps?: NectrDeps): Promise<NectrUser[]> {
  const json = (await nectrGet(`/users/?locationId=${encodeURIComponent(locationId)}`, deps)) as {
    users?: Array<Record<string, unknown>>
  }
  const raw = json.users ?? []
  return raw.map((u) => ({
    id: String(u.id ?? ''),
    name: String(u.name ?? ''),
    email: (u.email as string | undefined) ?? null,
    role: (u.roles as { role?: string } | undefined)?.role ?? null,
  }))
}

/** Pick a stable service user for later posting: prefer an admin, else the first user, else null. */
export function pickServiceUserId(users: NectrUser[]): string | null {
  if (users.length === 0) return null
  const admin = users.find((u) => u.role === 'admin')
  return (admin ?? users[0]).id
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/nectr-social.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/nectr-social.ts tests/lib/nectr-social.test.ts
git commit -m "feat(nectr): read-only Social Planner API wrapper (accounts, users, health types)"
```

---

### Task 2: Data model — `Client.nectrLocationId`

Add the non-secret per-client Location ID: a Prisma column, a matching migration, and the two Zod schemas.

**Files:**
- Modify: `src/db/schema.prisma` (the `model Client` block, near `canvaUrl`)
- Create: `src/db/migrations/20260812210000_add_client_nectr_location_id/migration.sql`
- Modify: `src/lib/schemas/client.ts` (`clientInputSchema` and `clientUpdateSchema`)
- Test: `tests/lib/schemas/client.test.ts` (extend)

**Interfaces:**
- Consumes: nothing.
- Produces: `Client.nectrLocationId?: string | null` (Prisma type) and `nectrLocationId?: string` on `ClientInput` / `ClientUpdate`.

- [ ] **Step 1: Write the failing schema tests**

In `tests/lib/schemas/client.test.ts`, add these cases inside the existing `describe('clientUpdateSchema', ...)` block (after the "still validates" test):

```ts
  it('accepts a nectrLocationId string', () => {
    const result = clientUpdateSchema.safeParse({ nectrLocationId: 'MM92yp3LqV0bqR0UaTr5' })
    expect(result.success).toBe(true)
  })

  it('accepts an empty nectrLocationId (cleared field)', () => {
    const result = clientUpdateSchema.safeParse({ nectrLocationId: '' })
    expect(result.success).toBe(true)
  })

  it('rejects a non-string nectrLocationId', () => {
    const result = clientUpdateSchema.safeParse({ nectrLocationId: 123 })
    expect(result.success).toBe(false)
  })
```

- [ ] **Step 2: Run the schema tests to verify they fail**

Run: `npx vitest run tests/lib/schemas/client.test.ts`
Expected: FAIL — `nectrLocationId: 123` is currently accepted (unknown keys pass through), so "rejects a non-string" fails.

- [ ] **Step 3: Add the schema fields**

In `src/lib/schemas/client.ts`, add this line to BOTH `clientInputSchema` (after the `canvaUrl` line at :49) and `clientUpdateSchema` (after the `canvaUrl` line at :81):

```ts
  nectrLocationId: z.string().trim().max(100).optional().or(z.literal('')),
```

- [ ] **Step 4: Run the schema tests to verify they pass**

Run: `npx vitest run tests/lib/schemas/client.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the Prisma column**

In `src/db/schema.prisma`, inside `model Client`, add this line immediately after the `canvaUrl String?` line:

```prisma
  nectrLocationId String?
```

- [ ] **Step 6: Create the migration**

Create `src/db/migrations/20260812210000_add_client_nectr_location_id/migration.sql` (this repo hand-authors migrations because there is no local Postgres; the `schema-drift` + integration CI jobs validate it applies):

```sql
-- AlterTable
ALTER TABLE "clients" ADD COLUMN "nectrLocationId" TEXT;
```

- [ ] **Step 7: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: success; `Client` type now includes `nectrLocationId: string | null`.

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (the new field is optional everywhere; nothing else breaks).

- [ ] **Step 9: Commit**

```bash
git add src/db/schema.prisma src/db/migrations/20260812210000_add_client_nectr_location_id/migration.sql src/lib/schemas/client.ts tests/lib/schemas/client.test.ts
git commit -m "feat(nectr): add plaintext Client.nectrLocationId field + validation"
```

---

### Task 3: Connection-health action `checkNectrConnectionAction`

A read-only, org-scoped server action that resolves the client's Location ID, calls the wrapper, and returns a `NectrConnectionStatus`.

**Files:**
- Modify: `src/app/(app)/clients/actions.ts` (add the action + imports)
- Test: `tests/app/clients/check-nectr-connection.test.ts`

**Interfaces:**
- Consumes: `getAccounts`, `getUsers`, `pickServiceUserId`, `NectrConfigError`, `NectrApiError`, `NectrConnectionStatus` from `@/lib/nectr-social` (Task 1); `requireClientEditor`, `findClientForUser` (existing); `Client.nectrLocationId` (Task 2).
- Produces: `checkNectrConnectionAction(clientId: string): Promise<NectrConnectionStatus>`.

- [ ] **Step 1: Write the failing tests**

Create `tests/app/clients/check-nectr-connection.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/middleware/permissions', () => ({
  requireClientEditor: vi.fn(),
  requireCan: vi.fn(),
}))
vi.mock('@/server/repositories/clients', () => ({
  createClient: vi.fn(),
  updateClient: vi.fn(),
  deactivateClient: vi.fn(),
  findClientForUser: vi.fn(),
}))
vi.mock('@/server/services/activity', () => ({
  recordActivity: vi.fn(),
  ActivityKind: {},
}))
vi.mock('@/db/client', () => ({ db: { user: { findMany: vi.fn() } } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/schemas/client', () => ({
  clientInputSchema: { parse: (x: unknown) => x },
  clientUpdateSchema: { parse: (x: unknown) => x },
}))
// Partial-mock the wrapper: keep the real error classes + pickServiceUserId so
// instanceof checks in the action work, but stub the two network functions.
vi.mock('@/lib/nectr-social', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/nectr-social')>()
  return { ...actual, getAccounts: vi.fn(), getUsers: vi.fn() }
})

import { checkNectrConnectionAction } from '@/app/(app)/clients/actions'
import { requireClientEditor } from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import { getAccounts, getUsers, NectrConfigError, NectrApiError } from '@/lib/nectr-social'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireClientEditor).mockResolvedValue({ userDbId: 'actor', organizationDbId: 'org1' } as never)
})

describe('checkNectrConnectionAction', () => {
  it('returns no-location and never calls NECTR when the client is out of scope', async () => {
    vi.mocked(findClientForUser).mockResolvedValue(null as never)
    const res = await checkNectrConnectionAction('c1')
    expect(res).toEqual({ status: 'no-location' })
    expect(getAccounts).not.toHaveBeenCalled()
  })

  it('returns no-location when the client has no nectrLocationId', async () => {
    vi.mocked(findClientForUser).mockResolvedValue({ id: 'c1', nectrLocationId: null } as never)
    const res = await checkNectrConnectionAction('c1')
    expect(res).toEqual({ status: 'no-location' })
    expect(getAccounts).not.toHaveBeenCalled()
  })

  it('returns ok with accounts and a resolved service user', async () => {
    vi.mocked(findClientForUser).mockResolvedValue({ id: 'c1', nectrLocationId: 'loc1' } as never)
    vi.mocked(getAccounts).mockResolvedValue([
      { id: 'a1', platform: 'facebook', name: 'FB', type: 'page', isExpired: false },
    ])
    vi.mocked(getUsers).mockResolvedValue([
      { id: 'u1', name: 'Julio', email: null, role: 'admin' },
    ])
    const res = await checkNectrConnectionAction('c1')
    expect(res).toEqual({
      status: 'ok',
      accounts: [{ id: 'a1', platform: 'facebook', name: 'FB', type: 'page', isExpired: false }],
      serviceUserId: 'u1',
    })
  })

  it('returns not-configured when the agency token is unset', async () => {
    vi.mocked(findClientForUser).mockResolvedValue({ id: 'c1', nectrLocationId: 'loc1' } as never)
    vi.mocked(getAccounts).mockRejectedValue(new NectrConfigError('NECTR_AGENCY_TOKEN is not set'))
    const res = await checkNectrConnectionAction('c1')
    expect(res).toEqual({ status: 'not-configured' })
  })

  it('returns error with the message on an API failure', async () => {
    vi.mocked(findClientForUser).mockResolvedValue({ id: 'c1', nectrLocationId: 'loc1' } as never)
    vi.mocked(getAccounts).mockRejectedValue(new NectrApiError(403, 'NECTR API 403: Forbidden'))
    const res = await checkNectrConnectionAction('c1')
    expect(res).toEqual({ status: 'error', message: 'NECTR API 403: Forbidden' })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/app/clients/check-nectr-connection.test.ts`
Expected: FAIL — `checkNectrConnectionAction` is not exported.

- [ ] **Step 3: Implement the action**

In `src/app/(app)/clients/actions.ts`, add the import near the other imports (after the `diffFieldChanges` import at :20):

```ts
import {
  getAccounts,
  getUsers,
  pickServiceUserId,
  NectrConfigError,
  NectrApiError,
  type NectrConnectionStatus,
} from '@/lib/nectr-social'
```

Then add the action at the end of the file:

```ts
/**
 * Read-only NECTR connection health for a client. Org-scoped like the other
 * client actions. Returns a status union rather than throwing, so the UI can
 * render every outcome. Never posts; only GETs accounts + users.
 */
export async function checkNectrConnectionAction(clientId: string): Promise<NectrConnectionStatus> {
  const ctx = await requireClientEditor()
  const client = await findClientForUser(ctx, clientId)
  // Out-of-scope / not-found collapses to no-location (benign, no existence
  // leak; the button only renders on a client the caller can already see).
  if (!client) return { status: 'no-location' }

  const locationId = client.nectrLocationId?.trim()
  if (!locationId) return { status: 'no-location' }

  try {
    const [accounts, users] = await Promise.all([getAccounts(locationId), getUsers(locationId)])
    return { status: 'ok', accounts, serviceUserId: pickServiceUserId(users) }
  } catch (e) {
    if (e instanceof NectrConfigError) return { status: 'not-configured' }
    if (e instanceof NectrApiError) return { status: 'error', message: e.message }
    return { status: 'error', message: e instanceof Error ? e.message : 'Connection check failed' }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/app/clients/check-nectr-connection.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/clients/actions.ts" tests/app/clients/check-nectr-connection.test.ts
git commit -m "feat(nectr): read-only checkNectrConnectionAction (org-scoped health)"
```

---

### Task 4: Client profile UI — Location ID field + Test connection

Add the editable Location ID field to the existing "Scheduling" section and a "Test connection" component that runs the action and renders the result.

**Files:**
- Create: `src/components/clients/nectr-connection-check.tsx`
- Modify: `src/components/clients/client-profile-view.tsx` (import + Scheduling section)
- Test: `tests/components/clients/nectr-connection-check.test.tsx`

**Interfaces:**
- Consumes: `checkNectrConnectionAction` (Task 3); `NectrConnectionStatus` (Task 1); `Client.nectrLocationId` (Task 2); existing `KeyValueField` in `client-profile-view.tsx`.
- Produces: `NectrConnectionCheck({ clientId }: { clientId: string })` React component.

- [ ] **Step 1: Write the failing component tests**

Create `tests/components/clients/nectr-connection-check.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NectrConnectionCheck } from '@/components/clients/nectr-connection-check'
import { checkNectrConnectionAction } from '@/app/(app)/clients/actions'

vi.mock('@/app/(app)/clients/actions', () => ({ checkNectrConnectionAction: vi.fn() }))

describe('NectrConnectionCheck', () => {
  it('lists connected accounts with live / expired state on success', async () => {
    vi.mocked(checkNectrConnectionAction).mockResolvedValue({
      status: 'ok',
      accounts: [
        { id: 'a1', platform: 'facebook', name: 'Five One Nine', type: 'page', isExpired: false },
        { id: 'a2', platform: 'instagram', name: 'fiveonenine', type: 'profile', isExpired: true },
      ],
      serviceUserId: 'u1',
    })
    render(<NectrConnectionCheck clientId="c1" />)
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }))

    expect(await screen.findByText(/Five One Nine/)).toBeInTheDocument()
    expect(screen.getByText(/live/i)).toBeInTheDocument()
    expect(screen.getByText(/expired, reconnect in NECTR/i)).toBeInTheDocument()
    expect(checkNectrConnectionAction).toHaveBeenCalledWith('c1')
  })

  it('shows a no-location message', async () => {
    vi.mocked(checkNectrConnectionAction).mockResolvedValue({ status: 'no-location' })
    render(<NectrConnectionCheck clientId="c1" />)
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }))
    expect(await screen.findByText(/no nectr location id/i)).toBeInTheDocument()
  })

  it('shows the error message on failure', async () => {
    vi.mocked(checkNectrConnectionAction).mockResolvedValue({ status: 'error', message: 'NECTR API 403' })
    render(<NectrConnectionCheck clientId="c1" />)
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }))
    expect(await screen.findByText(/NECTR API 403/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/clients/nectr-connection-check.test.tsx`
Expected: FAIL — cannot resolve `@/components/clients/nectr-connection-check`.

- [ ] **Step 3: Implement the component**

Create `src/components/clients/nectr-connection-check.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { checkNectrConnectionAction } from '@/app/(app)/clients/actions'
import type { NectrConnectionStatus } from '@/lib/nectr-social'

export function NectrConnectionCheck({ clientId }: { clientId: string }) {
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<NectrConnectionStatus | null>(null)

  const run = () => {
    startTransition(async () => {
      setStatus(await checkNectrConnectionAction(clientId))
    })
  }

  return (
    <div className="mt-2">
      <Button type="button" onClick={run} disabled={pending}>
        {pending ? 'Checking…' : 'Test connection'}
      </Button>
      {status && <ConnectionResult status={status} />}
    </div>
  )
}

function ConnectionResult({ status }: { status: NectrConnectionStatus }) {
  if (status.status === 'no-location') {
    return <p className="text-[12px] text-muted-foreground mt-2">No NECTR Location ID set for this client.</p>
  }
  if (status.status === 'not-configured') {
    return (
      <p className="text-[12px] text-muted-foreground mt-2">
        NECTR is not configured on the server (missing agency token).
      </p>
    )
  }
  if (status.status === 'error') {
    return <p className="text-[12px] text-destructive mt-2">Connection failed: {status.message}</p>
  }
  if (status.accounts.length === 0) {
    return (
      <p className="text-[12px] text-muted-foreground mt-2">
        Connected, but no social accounts are linked in NECTR yet.
      </p>
    )
  }
  return (
    <ul className="mt-2 space-y-1">
      {status.accounts.map((a) => (
        <li key={a.id} className="text-[12px]">
          <span className="font-medium capitalize">{a.platform}</span>: {a.name}{' '}
          {a.isExpired ? (
            <span className="text-destructive">(expired, reconnect in NECTR)</span>
          ) : (
            <span className="text-green-600">(live)</span>
          )}
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/clients/nectr-connection-check.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire the field + component into the profile**

In `src/components/clients/client-profile-view.tsx`:

(a) Add the import after the `updateClientAction` import (:15):

```ts
import { NectrConnectionCheck } from './nectr-connection-check'
```

(b) Replace the existing "Scheduling" `PageSection` (:78-95) so it adds the Location ID field and the Test connection control below the grid:

```tsx
      <PageSection title="Scheduling">
        <KeyValueGrid>
          <PostingDaysField clientId={client.id} value={client.postingDays} canEdit={canEdit} />
          <KeyValueField clientId={client.id} fieldKey="postLength" label="Post length" value={client.postLength} canEdit={canEdit} placeholder="e.g. Max 360 characters" />
          <SelectField
            clientId={client.id}
            fieldKey="holidayHandling"
            label="Holiday handling"
            value={client.holidayHandling}
            canEdit={canEdit}
            options={[
              { value: 'Major-US', label: 'Major US holidays' },
              { value: 'Off', label: 'None' },
            ]}
          />
          <ChipsField clientId={client.id} fieldKey="excludedDates" label="Excluded dates" value={client.excludedDates} canEdit={canEdit} placeholder="2026-01-01, 2026-07-04" />
          <KeyValueField clientId={client.id} fieldKey="nectrLocationId" label="NECTR Location ID" value={client.nectrLocationId} canEdit={canEdit} placeholder="e.g. MM92yp3LqV0bqR0UaTr5" />
        </KeyValueGrid>
        {canEdit && <NectrConnectionCheck clientId={client.id} />}
      </PageSection>
```

- [ ] **Step 6: Typecheck (confirms `fieldKey="nectrLocationId"` + `client.nectrLocationId` resolve)**

Run: `npx tsc --noEmit`
Expected: PASS — `nectrLocationId` is a valid `ClientUpdate` key (Task 2) and a `Client` field (Task 2).

- [ ] **Step 7: Run the component tests again**

Run: `npx vitest run tests/components/clients/nectr-connection-check.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/clients/nectr-connection-check.tsx "src/components/clients/client-profile-view.tsx" tests/components/clients/nectr-connection-check.test.tsx
git commit -m "feat(nectr): client-profile Location ID field + Test connection button"
```

---

### Task 5: Finalize — full green gate + PR

Not a TDD task; the whole-suite gate and the pull request.

- [ ] **Step 1: Run the full gate**

```bash
npx tsc --noEmit
npx vitest run
npx next build
npx eslint .
```

Expected: all clean. If `eslint` flags a pre-existing issue in a file you did not touch, leave it (do not fix unrelated code); fix anything in the five files this plan created or changed.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin docs/nectr-scheduling-phase1-spec
gh pr create --base main --title "NECTR auto-scheduling Phase 1: connection wiring + health check" \
  --body "Phase 1 of the NECTR auto-scheduling feature. Adds a plaintext per-client NECTR Location ID, a read-only Social Planner API wrapper (shared agency token), an org-scoped connection-health action, and a Test connection button on the client profile. No posting (Phase 2). Additive nullable migration; no pipeline change. Spec + plan in docs/superpowers/. Requires NECTR_AGENCY_TOKEN in the env for the health check to return ok against a real sub-account."
```

Note: the branch `docs/nectr-scheduling-phase1-spec` already carries the spec and this plan; the implementation commits land on the same branch, so one PR ships the docs + Phase 1 code together. (Split into a fresh `feat/` branch first if you would rather keep docs and code separate.)

---

## Self-Review

**Spec coverage** (each spec change maps to a task):
- Wrapper `nectr-social.ts` (`getAgencyToken`, `getAccounts`, `getUsers`, typed errors) → Task 1. `pickServiceUserId` is the spec's "resolve a service user" step, also Task 1.
- `Client.nectrLocationId` column + migration + zod (`clientInputSchema` + `clientUpdateSchema`) → Task 2.
- `checkNectrConnectionAction` with the `NectrConnectionStatus` union (`no-location` / `not-configured` / `error` / `ok`) + org scope → Task 3.
- "Test connection" UI + Location ID field row → Task 4.
- Green gate + one PR → Task 5.

**Deliberate scope trim vs the spec:** the spec's testing list mentioned a standalone "field row renders/saves" test. The Location ID field is a zero-logic reuse of the proven `KeyValueField` (same wiring as ten sibling fields), and a dedicated `ClientProfileView` render test would require constructing a full `Client` fixture for no new-logic coverage. Task 4 instead covers the meaningful new UI (the connection component) and Task 6 Step 6's `tsc` proves the field key + Prisma field resolve. This is an intentional trim, noted here rather than silently dropped.

**Placeholder scan:** no TBD/TODO; every code and test step shows complete code and exact commands.

**Type consistency:** `NectrAccount` / `NectrUser` / `NectrConnectionStatus` and the function signatures (`getAccounts`, `getUsers`, `pickServiceUserId`, `checkNectrConnectionAction`) are used identically across Tasks 1, 3, and 4. The action returns the same union the component consumes. `nectrLocationId` is the field key in the schema (Task 2), the action's read (Task 3), and the profile field (Task 4).

## Global note for the implementer

The `NECTR_AGENCY_TOKEN` precondition (Caleb mints an agency-scoped social token) is external. All five tasks build and pass their gate WITHOUT it (the wrapper and action are unit-tested with injected/mocked deps). Only a live "Test connection" against a real sub-account needs the token set in the env. If the agency token proves impossible on the NECTR whitelabel, the only change is `getAgencyToken` (Task 1) becoming a per-client encrypted-PIT lookup; Tasks 2 to 5 are unaffected.
