# NECTR Auto-Scheduling Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the scheduling step, automatically create real scheduled posts in the client's NECTR sub-account via API (8am location-local, all connected accounts), mirroring the #425 Drive upload, with the manual CSV path left intact as a failsafe.

**Architecture:** A best-effort `scheduleBatchToNectr` service invoked from `finishBatchAction` next to the Drive upload, built on the Phase 1 `nectr-social.ts` wrapper. Idempotent via a new `Post.nectrScheduledId`. Content matches the CSV exactly (reuse `buildContent`). Plus a deep-link to NECTR's connections page in the client profile.

**Tech Stack:** Next.js 16, Prisma 7, Postgres (Neon), vitest + @testing-library/react. NECTR API is plain HTTPS (`fetch`), no SDK.

## Global Constraints

- **Do NOT modify the CSV failsafe's behavior:** `social-planner-csv.ts` (except an additive `export` on `buildContent`), `export-and-schedule-button.tsx`, `go-to-nectrcrm-button.tsx` stay functionally unchanged.
- **True-scheduled, all connected non-expired accounts, `mediaUrls[0]` only** (v1). Content = `buildContent(caption, hashtags.join(' '))` (byte-for-byte match with the CSV).
- **`scheduleDate` = 8am location-local on `postDate`.** The exact wire format is confirmed by Task 1 before the service is trusted on real clients.
- **Additive, nullable migration only** (`Post.nectrScheduledId`); no `src/server/jobs` change (no pipeline redeploy).
- **Best-effort:** a NECTR failure must never roll back the relay completion. Idempotent: a post with a `nectrScheduledId` is never re-created.
- **Credential:** shared `NECTR_AGENCY_TOKEN` (Phase 1); until it's set, the push cleanly skips as `not-configured`.
- **Green gate before PR:** `tsc` 0, unit suite, `next build`, eslint clean on changed files. One PR.

---

### Task 1: Timezone validation spike [ORCHESTRATOR-RUN — not a subagent task]

Phase 0's scheduled post used a UTC `...Z` `scheduleDate` and did not fire in-window (NECTR appears to read the clock digits as location-local). The CSV's proven behavior is tz-naive local `"<date> 08:00"`. This task pins the exact `scheduleDate` string the API needs to fire at 8am in the location's timezone. **The orchestrator runs this via `curl` against the internal FON sub-account (location `MM92yp3LqV0bqR0UaTr5`, PIT from Airtable) before dispatching Task 4.**

- [ ] **Step 1:** Create a `status:"scheduled"` post ~5 minutes out, `scheduleDate` = the location-local wall-clock time as `YYYY-MM-DDTHH:MM:00` (NO `Z`), on one FB account, labeled "tz spike — disregard".
- [ ] **Step 2:** Poll the post until it flips `scheduled -> published` (or past the expected fire time). If it fires at the intended wall-clock, the tz-naive-local format is confirmed. If the API rejects the no-`Z` value at create time, retry with `...T08:00:00.000Z` (digits = local) and with the location's numeric offset (`...-04:00`), and record which one fires correctly.
- [ ] **Step 3:** Delete the test post. Record the confirmed template in the ledger; Task 4's `buildNectrScheduleDate` uses it. **Default expectation (write Task 4 against this unless the spike disproves it): `` `${yyyy}-${mm}-${dd}T08:00:00` `` (tz-naive, NECTR applies the location timezone, matching the CSV).** If instead NECTR honors UTC, Task 2/4 gain a `getLocation` tz lookup + a UTC conversion — note that contingency to the human before proceeding.

---

### Task 2: `createPost` in the wrapper (`src/lib/nectr-social.ts`)

**Files:**
- Modify: `src/lib/nectr-social.ts`
- Test: `tests/lib/nectr-social.test.ts` (extend)

**Interfaces:**
- Consumes: Phase 1's `nectrGet`/token/error infra in the same file.
- Produces: `createPost(locationId: string, input: CreatePostInput, deps?: { fetchImpl?: typeof fetch; token?: string }): Promise<{ id: string }>` where `CreatePostInput = { accountIds: string[]; summary: string; mediaUrl?: string; mediaType?: string; scheduleDate: string; userId: string }`.

- [ ] **Step 1: Write the failing tests** — append to `tests/lib/nectr-social.test.ts`:

```ts
import { createPost } from '@/lib/nectr-social'

describe('createPost', () => {
  it('POSTs a scheduled post with the required fields and returns the id', async () => {
    const fetchImpl = vi.fn(async () =>
      ({ ok: true, status: 201, json: async () => ({ results: { post: { _id: 'post_123' } } }), text: async () => '' }) as unknown as Response,
    ) as unknown as typeof fetch

    const res = await createPost(
      'loc1',
      {
        accountIds: ['acc_fb', 'acc_ig'],
        summary: 'Hello #world',
        mediaUrl: 'https://blob.example/img.png',
        mediaType: 'image/png',
        scheduleDate: '2026-09-01T08:00:00',
        userId: 'user_1',
      },
      { fetchImpl, token: 't' },
    )

    expect(res).toEqual({ id: 'post_123' })
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0]
    expect(url).toBe('https://services.leadconnectorhq.com/social-media-posting/loc1/posts')
    expect(init).toMatchObject({ method: 'POST' })
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toMatchObject({
      accountIds: ['acc_fb', 'acc_ig'],
      summary: 'Hello #world',
      status: 'scheduled',
      type: 'post',
      scheduleDate: '2026-09-01T08:00:00',
      userId: 'user_1',
      media: [{ url: 'https://blob.example/img.png', type: 'image/png' }],
    })
  })

  it('omits media when no url is given', async () => {
    const fetchImpl = vi.fn(async () =>
      ({ ok: true, status: 201, json: async () => ({ results: { post: { _id: 'p2' } } }), text: async () => '' }) as unknown as Response,
    ) as unknown as typeof fetch
    await createPost('loc1', { accountIds: ['a'], summary: 's', scheduleDate: '2026-09-01T08:00:00', userId: 'u' }, { fetchImpl, token: 't' })
    const body = JSON.parse((vi.mocked(fetchImpl).mock.calls[0][1] as RequestInit).body as string)
    expect(body.media).toBeUndefined()
  })

  it('throws NectrApiError on a non-2xx response', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 422, json: async () => ({}), text: async () => 'bad' }) as unknown as Response) as unknown as typeof fetch
    await expect(
      createPost('loc1', { accountIds: ['a'], summary: 's', scheduleDate: 'x', userId: 'u' }, { fetchImpl, token: 't' }),
    ).rejects.toBeInstanceOf(NectrApiError)
  })
})
```

- [ ] **Step 2: Run to verify they fail** — `npx vitest run tests/lib/nectr-social.test.ts` → FAIL (`createPost` not exported).

- [ ] **Step 3: Implement** — append to `src/lib/nectr-social.ts`:

```ts
export interface CreatePostInput {
  accountIds: string[]
  summary: string
  mediaUrl?: string
  mediaType?: string
  scheduleDate: string
  userId: string
}

async function nectrPost(path: string, body: unknown, deps?: NectrDeps): Promise<unknown> {
  const token = deps?.token ?? getAgencyToken()
  const fetchImpl = deps?.fetchImpl ?? fetch
  const res = await fetchImpl(`${NECTR_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Version: NECTR_API_VERSION,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let message = `NECTR API ${res.status}`
    try {
      const t = await res.text()
      if (t) message = `${message}: ${t.slice(0, 300)}`
    } catch {
      // status is enough
    }
    throw new NectrApiError(res.status, message)
  }
  return res.json()
}

export async function createPost(
  locationId: string,
  input: CreatePostInput,
  deps?: NectrDeps,
): Promise<{ id: string }> {
  const body: Record<string, unknown> = {
    accountIds: input.accountIds,
    summary: input.summary,
    status: 'scheduled',
    type: 'post',
    scheduleDate: input.scheduleDate,
    userId: input.userId,
  }
  if (input.mediaUrl) {
    body.media = [{ url: input.mediaUrl, type: input.mediaType ?? 'image/jpeg' }]
  }
  const json = (await nectrPost(`/social-media-posting/${locationId}/posts`, body, deps)) as {
    results?: { post?: { _id?: string } }
  }
  const id = json.results?.post?._id
  if (!id) throw new NectrApiError(200, 'NECTR create-post returned no post id')
  return { id }
}
```

- [ ] **Step 4: Run to verify they pass** — `npx vitest run tests/lib/nectr-social.test.ts` → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/nectr-social.ts tests/lib/nectr-social.test.ts
git commit -m "feat(nectr): createPost wrapper (scheduled post)"
```

---

### Task 3: Idempotency field `Post.nectrScheduledId`

**Files:**
- Modify: `src/db/schema.prisma` (model `Post`, near `mediaUrls`)
- Create: `src/db/migrations/20260813120000_add_post_nectr_scheduled_id/migration.sql`
- Test: none new (schema-only; the service tests in Task 4 exercise it)

**Interfaces:** Produces `Post.nectrScheduledId?: string | null`.

- [ ] **Step 1: Add the column** — in `src/db/schema.prisma`, inside `model Post`, add after the `mediaUrls String[]` line:

```prisma
  nectrScheduledId String?
```

- [ ] **Step 2: Create the migration** — `src/db/migrations/20260813120000_add_post_nectr_scheduled_id/migration.sql` (hand-authored; CI validates):

```sql
-- AlterTable
ALTER TABLE "posts" ADD COLUMN "nectrScheduledId" TEXT;
```

(Confirm the `Post` table name is `posts` from its `@@map` in `schema.prisma`; adjust the SQL if the map differs.)

- [ ] **Step 3: Regenerate** — `npx prisma generate` → success; `Post` type now has `nectrScheduledId`.
- [ ] **Step 4: Typecheck** — `npx tsc --noEmit`. If a hand-built `Post`-typed test fixture now errors on the missing key, add `nectrScheduledId: null` to it (same in-scope pattern as Phase 1's Client fixture). Repeat until clean.
- [ ] **Step 5: Commit**

```bash
git add src/db/schema.prisma "src/db/migrations/20260813120000_add_post_nectr_scheduled_id/migration.sql"
git commit -m "feat(nectr): add Post.nectrScheduledId idempotency field"
```

---

### Task 4: The push service (`src/server/services/nectr-schedule.ts`)

**Files:**
- Create: `src/server/services/nectr-schedule.ts`
- Modify: `src/lib/social-planner-csv.ts` (add `export` to `buildContent` only — no behavior change)
- Test: `tests/server/services/nectr-schedule.test.ts`

**Interfaces:**
- Consumes: `getAccounts`, `getUsers`, `pickServiceUserId`, `createPost`, `NectrConfigError` (Task 2); `buildContent` (exported); `Post.nectrScheduledId` (Task 3).
- Produces: `scheduleBatchToNectr(batchId: string): Promise<NectrScheduleResult>` and the `NectrScheduleResult` union; `buildNectrScheduleDate(postDate: Date): string`.

- [ ] **Step 1: Export `buildContent`** — in `src/lib/social-planner-csv.ts`, change `function buildContent(` to `export function buildContent(`. Nothing else.

- [ ] **Step 2: Write the failing tests** — `tests/server/services/nectr-schedule.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/nectr-social', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/nectr-social')>()
  return { ...actual, getAccounts: vi.fn(), getUsers: vi.fn(), createPost: vi.fn() }
})
vi.mock('@/db/client', () => ({
  db: { batch: { findUnique: vi.fn() }, post: { findMany: vi.fn(), update: vi.fn() } },
}))

import { scheduleBatchToNectr, buildNectrScheduleDate } from '@/server/services/nectr-schedule'
import { getAccounts, getUsers, createPost, NectrConfigError } from '@/lib/nectr-social'
import { db } from '@/db/client'

const ACCT = (id: string, isExpired = false) => ({ id, platform: 'facebook', name: id, type: 'page', isExpired })
const USER = { id: 'svc_user', name: 'Svc', email: null, role: 'admin' }

function mockBatch(nectrLocationId: string | null) {
  vi.mocked(db.batch.findUnique).mockResolvedValue({ id: 'b1', client: { nectrLocationId } } as never)
}
function mockPosts(posts: unknown[]) {
  vi.mocked(db.post.findMany).mockResolvedValue(posts as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getAccounts).mockResolvedValue([ACCT('acc_fb')])
  vi.mocked(getUsers).mockResolvedValue([USER])
  vi.mocked(createPost).mockResolvedValue({ id: 'np_1' })
  vi.mocked(db.post.update).mockResolvedValue({} as never)
})

describe('buildNectrScheduleDate', () => {
  it('is 8am on the post date (tz-naive local, matching the CSV)', () => {
    expect(buildNectrScheduleDate(new Date('2026-09-01T00:00:00Z'))).toBe('2026-09-01T08:00:00')
  })
})

describe('scheduleBatchToNectr', () => {
  it('skips when the client has no NECTR location', async () => {
    mockBatch(null)
    expect(await scheduleBatchToNectr('b1')).toEqual({ status: 'skipped', reason: 'no-location' })
    expect(getAccounts).not.toHaveBeenCalled()
  })

  it('skips not-configured when the token is unset', async () => {
    mockBatch('loc1')
    vi.mocked(getAccounts).mockRejectedValue(new NectrConfigError('unset'))
    expect(await scheduleBatchToNectr('b1')).toEqual({ status: 'skipped', reason: 'not-configured' })
  })

  it('skips no-accounts when every account is expired', async () => {
    mockBatch('loc1')
    vi.mocked(getAccounts).mockResolvedValue([ACCT('acc_fb', true)])
    expect(await scheduleBatchToNectr('b1')).toEqual({ status: 'skipped', reason: 'no-accounts' })
  })

  it('schedules each unscheduled post and persists the NECTR id', async () => {
    mockBatch('loc1')
    mockPosts([
      { id: 'p1', postDate: new Date('2026-09-01T00:00:00Z'), caption: 'A', hashtags: ['#x'], mediaUrls: ['https://b/1.png'], nectrScheduledId: null },
      { id: 'p2', postDate: new Date('2026-09-03T00:00:00Z'), caption: 'B', hashtags: [], mediaUrls: [], nectrScheduledId: null },
    ])
    const res = await scheduleBatchToNectr('b1')
    expect(res).toMatchObject({ status: 'ok', scheduled: 2, alreadyScheduled: 0, accounts: 1, failed: [] })
    expect(createPost).toHaveBeenCalledWith('loc1', expect.objectContaining({
      accountIds: ['acc_fb'], summary: 'A\n\n#x', mediaUrl: 'https://b/1.png', scheduleDate: '2026-09-01T08:00:00', userId: 'svc_user',
    }), )
    expect(db.post.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { nectrScheduledId: 'np_1' } })
  })

  it('is idempotent: skips posts that already have a nectrScheduledId', async () => {
    mockBatch('loc1')
    mockPosts([
      { id: 'p1', postDate: new Date('2026-09-01T00:00:00Z'), caption: 'A', hashtags: [], mediaUrls: [], nectrScheduledId: 'existing' },
    ])
    const res = await scheduleBatchToNectr('b1')
    expect(res).toMatchObject({ status: 'ok', scheduled: 0, alreadyScheduled: 1 })
    expect(createPost).not.toHaveBeenCalled()
  })

  it('returns partial when one post fails', async () => {
    mockBatch('loc1')
    mockPosts([
      { id: 'p1', postDate: new Date('2026-09-01T00:00:00Z'), caption: 'A', hashtags: [], mediaUrls: ['u'], nectrScheduledId: null },
      { id: 'p2', postDate: new Date('2026-09-02T00:00:00Z'), caption: 'B', hashtags: [], mediaUrls: ['u'], nectrScheduledId: null },
    ])
    vi.mocked(createPost).mockResolvedValueOnce({ id: 'np_1' }).mockRejectedValueOnce(new Error('boom'))
    const res = await scheduleBatchToNectr('b1')
    expect(res).toMatchObject({ status: 'partial', scheduled: 1, failed: [{ post: 'p2', reason: 'boom' }] })
  })
})
```

- [ ] **Step 3: Run to verify they fail** — `npx vitest run tests/server/services/nectr-schedule.test.ts` → FAIL (module not found).

- [ ] **Step 4: Implement** — create `src/server/services/nectr-schedule.ts`:

```ts
/**
 * Schedule a batch's posts into the client's NECTR Social Planner via API, on the
 * relay-finish transition. Best-effort: never throws for expected conditions; a
 * failure must not roll back the relay completion. Idempotent via
 * Post.nectrScheduledId. The manual CSV export stays as a fallback.
 *
 * Spec: docs/superpowers/specs/2026-08-13-nectr-auto-scheduling-phase2-design.md
 */
import { db } from '@/db/client'
import { getAccounts, getUsers, pickServiceUserId, createPost, NectrConfigError } from '@/lib/nectr-social'
import { buildContent } from '@/lib/social-planner-csv'

export type NectrScheduleResult =
  | { status: 'skipped'; reason: 'no-location' | 'not-configured' | 'no-accounts' | 'no-user' | 'no-posts' }
  | {
      status: 'ok' | 'partial' | 'failed'
      scheduled: number
      alreadyScheduled: number
      accounts: number
      failed: { post: string; reason: string }[]
    }

/** 8am on the post's date, tz-naive local. NECTR applies the location's timezone,
 * matching the CSV's "<date> 08:00". Format confirmed by the Task 1 spike. */
export function buildNectrScheduleDate(postDate: Date): string {
  const y = postDate.getUTCFullYear()
  const m = String(postDate.getUTCMonth() + 1).padStart(2, '0')
  const d = String(postDate.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}T08:00:00`
}

function imageTypeFromUrl(url: string): string {
  const ext = url.split('?')[0].match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'image/jpeg'
}

export async function scheduleBatchToNectr(batchId: string): Promise<NectrScheduleResult> {
  const batch = await db.batch.findUnique({
    where: { id: batchId },
    select: { id: true, client: { select: { nectrLocationId: true } } },
  })
  const locationId = batch?.client.nectrLocationId?.trim()
  if (!locationId) return { status: 'skipped', reason: 'no-location' }

  let accounts, users
  try {
    ;[accounts, users] = await Promise.all([getAccounts(locationId), getUsers(locationId)])
  } catch (err) {
    if (err instanceof NectrConfigError) return { status: 'skipped', reason: 'not-configured' }
    throw err
  }

  const live = accounts.filter((a) => !a.isExpired)
  if (live.length === 0) return { status: 'skipped', reason: 'no-accounts' }
  const accountIds = live.map((a) => a.id)
  const userId = pickServiceUserId(users)
  if (!userId) return { status: 'skipped', reason: 'no-user' }

  const posts = await db.post.findMany({
    where: { batchId, deletedAt: null },
    orderBy: { postDate: 'asc' },
    select: { id: true, postDate: true, caption: true, hashtags: true, mediaUrls: true, nectrScheduledId: true },
  })
  if (posts.length === 0) return { status: 'skipped', reason: 'no-posts' }

  let scheduled = 0
  let alreadyScheduled = 0
  const failed: { post: string; reason: string }[] = []

  for (const post of posts) {
    if (post.nectrScheduledId) {
      alreadyScheduled++
      continue
    }
    try {
      const mediaUrl = post.mediaUrls[0]
      const { id } = await createPost(locationId, {
        accountIds,
        summary: buildContent(post.caption, post.hashtags.join(' ')),
        mediaUrl,
        mediaType: mediaUrl ? imageTypeFromUrl(mediaUrl) : undefined,
        scheduleDate: buildNectrScheduleDate(post.postDate),
        userId,
      })
      await db.post.update({ where: { id: post.id }, data: { nectrScheduledId: id } })
      scheduled++
    } catch (err) {
      failed.push({ post: post.id, reason: err instanceof Error ? err.message : String(err) })
    }
  }

  const status = failed.length === 0 ? 'ok' : scheduled + alreadyScheduled > 0 ? 'partial' : 'failed'
  return { status, scheduled, alreadyScheduled, accounts: live.length, failed }
}
```

- [ ] **Step 5: Run to verify they pass** — `npx vitest run tests/server/services/nectr-schedule.test.ts` → PASS.
- [ ] **Step 6: Typecheck** — `npx tsc --noEmit` → clean.
- [ ] **Step 7: Commit**

```bash
git add src/server/services/nectr-schedule.ts src/lib/social-planner-csv.ts tests/server/services/nectr-schedule.test.ts
git commit -m "feat(nectr): scheduleBatchToNectr push service (idempotent, best-effort)"
```

---

### Task 5: Hook into `finishBatchAction` + toast/retry

**Files:**
- Modify: `src/server/actions/relay.ts` (import, `finishBatchAction`, new `retryNectrScheduleAction`)
- Modify: `src/components/relay/checklist-panel.tsx` (import, `notifyNectrResult`, `retryNectrSchedule`, `finish`)
- Test: `tests/server/actions/relay-nectr-schedule.test.ts`

**Interfaces:**
- Consumes: `scheduleBatchToNectr`, `NectrScheduleResult` (Task 4).
- Produces: `finishBatchAction` returns `{ ...result, driveUpload, nectrSchedule }`; `retryNectrScheduleAction({ batchId }): Promise<NectrScheduleResult>`.

- [ ] **Step 1: Write the failing action test** — `tests/server/actions/relay-nectr-schedule.test.ts` (mock the seams so importing the action is safe; assert the push runs and a throw is swallowed):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/middleware/permissions', () => ({ requireCan: vi.fn() }))
vi.mock('@/server/services/relay', () => ({
  finishBatch: vi.fn(), forceStep: vi.fn(), markDesignRevisionsDone: vi.fn(),
  passBaton: vi.fn(), requestDesignChanges: vi.fn(), sendBackBaton: vi.fn(),
}))
vi.mock('@/server/services/drive-upload', () => ({ uploadPostGraphicsToDrive: vi.fn() }))
vi.mock('@/server/services/nectr-schedule', () => ({ scheduleBatchToNectr: vi.fn() }))
vi.mock('@/db/client', () => ({ db: { batch: { findUnique: vi.fn() } } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/server/lib/relay-state-machine', () => ({ legalNextSteps: vi.fn(() => []) }))
vi.mock('@/lib/relay-holder-override', () => ({ canOverrideHolder: () => true }))
vi.mock('@/server/lib/notifyHolderOfBatonHandoff', () => ({ notifyHolderOfBatonHandoff: vi.fn() }))

import { finishBatchAction } from '@/server/actions/relay'
import { requireCan } from '@/server/middleware/permissions'
import { finishBatch } from '@/server/services/relay'
import { uploadPostGraphicsToDrive } from '@/server/services/drive-upload'
import { scheduleBatchToNectr } from '@/server/services/nectr-schedule'
import { db } from '@/db/client'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireCan).mockResolvedValue({ userDbId: 'u', organizationDbId: 'o', role: 'admin', platformOwner: true } as never)
  vi.mocked(db.batch.findUnique).mockResolvedValue({ id: 'b1', clientId: 'c1', currentHolder: 'u' } as never)
  vi.mocked(finishBatch).mockResolvedValue({ ok: true } as never)
  vi.mocked(uploadPostGraphicsToDrive).mockResolvedValue({ status: 'skipped', reason: 'no-folder' } as never)
})

describe('finishBatchAction NECTR push', () => {
  it('runs scheduleBatchToNectr and returns its result on the payload', async () => {
    vi.mocked(scheduleBatchToNectr).mockResolvedValue({ status: 'ok', scheduled: 3, alreadyScheduled: 0, accounts: 2, failed: [] })
    const res = await finishBatchAction({ batchId: 'b1' })
    expect(scheduleBatchToNectr).toHaveBeenCalledWith('b1')
    expect(res.nectrSchedule).toEqual({ status: 'ok', scheduled: 3, alreadyScheduled: 0, accounts: 2, failed: [] })
  })

  it('swallows a NECTR push throw so the relay still completes', async () => {
    vi.mocked(scheduleBatchToNectr).mockRejectedValue(new Error('nectr down'))
    const res = await finishBatchAction({ batchId: 'b1' })
    expect(res.nectrSchedule).toBeNull()
    expect(res).toMatchObject({ ok: true })
  })
})
```

> Note for the implementer: if `loadHolderForGate` selects a narrower field set than the mock provides, align the `db.batch.findUnique` mock to what the real gate reads (see the existing `finishBatchAction` gate). Keep the two assertions above.

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/server/actions/relay-nectr-schedule.test.ts` → FAIL (`nectrSchedule` undefined).

- [ ] **Step 3: Implement the action changes** — in `src/server/actions/relay.ts`:

(a) after the drive-upload import block (lines 20-23), add:

```ts
import {
  scheduleBatchToNectr,
  type NectrScheduleResult,
} from '@/server/services/nectr-schedule'
```

(b) inside `finishBatchAction`, replace the `revalidateBatchSurfaces(...)` + `return` tail (lines 167-168) with:

```ts
  // Best-effort: schedule the posts into the client's NECTR Social Planner. Same
  // contract as the Drive upload — a NECTR failure must never undo completion.
  let nectrSchedule: NectrScheduleResult | null = null
  try {
    nectrSchedule = await scheduleBatchToNectr(input.batchId)
  } catch (err) {
    console.error('[relay] finishBatch NECTR schedule failed', {
      batchId: input.batchId,
      err: err instanceof Error ? err.message : String(err),
    })
  }

  revalidateBatchSurfaces(holder.clientId, input.batchId)
  return { ...result, driveUpload, nectrSchedule }
```

(c) after `retryDriveUploadAction` (ends line 190), add:

```ts
/** Manual retry of the NECTR schedule for a completed relay. Idempotent via
 * Post.nectrScheduledId (already-scheduled posts are skipped). Same holder gate. */
export async function retryNectrScheduleAction(input: {
  batchId: string
}): Promise<NectrScheduleResult> {
  const ctx = await requireCan('relay.pass')
  const holder = await loadHolderForGate(input.batchId, ctx.organizationDbId)
  const isOverride = ctx.userDbId !== holder.currentHolder
  if (isOverride && !canOverrideHolder(ctx.role, ctx.platformOwner)) {
    throw new Error('Only the current holder, an AM, or an admin can retry the NECTR schedule.')
  }
  const nectrSchedule = await scheduleBatchToNectr(input.batchId)
  revalidateBatchSurfaces(holder.clientId, input.batchId)
  return nectrSchedule
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/server/actions/relay-nectr-schedule.test.ts` → PASS.

- [ ] **Step 5: Wire the toast** — in `src/components/relay/checklist-panel.tsx`:

(a) add `retryNectrScheduleAction` to the `@/server/actions/relay` import (line 43-50) and, after the `DriveUploadResult` import (line 51), add:

```ts
import type { NectrScheduleResult } from '@/server/services/nectr-schedule'
```

(b) after `retryDriveUpload()` (ends line 223), add:

```ts
  function notifyNectrResult(res: NectrScheduleResult | null) {
    if (!res) {
      toast.error('Relay finished, but NECTR scheduling failed.', {
        action: { label: 'Retry', onClick: () => retryNectrSchedule() },
      })
      return
    }
    if (res.status === 'ok') {
      toast.success(`Scheduled ${res.scheduled} post${res.scheduled === 1 ? '' : 's'} to NECTR.`)
      return
    }
    if (res.status === 'partial') {
      toast.error(`Scheduled ${res.scheduled} to NECTR, ${res.failed.length} failed.`, {
        action: { label: 'Retry', onClick: () => retryNectrSchedule() },
      })
      return
    }
    if (res.status === 'failed') {
      toast.error('NECTR scheduling failed.', { action: { label: 'Retry', onClick: () => retryNectrSchedule() } })
      return
    }
    if (res.status === 'skipped') {
      if (res.reason === 'no-location') toast('Relay finished. No NECTR Location ID is set for this client, so nothing was scheduled.')
      else if (res.reason === 'not-configured') toast('Relay finished. NECTR scheduling is not configured yet.')
      else if (res.reason === 'no-accounts') toast('Relay finished. No connected NECTR accounts, so nothing was scheduled.')
    }
  }

  function retryNectrSchedule() {
    startActing(async () => {
      try {
        const res = await retryNectrScheduleAction({ batchId: batch.id })
        router.refresh()
        notifyNectrResult(res)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'NECTR scheduling failed')
      }
    })
  }
```

(c) in `finish()`, after `notifyDriveResult(res?.driveUpload ?? null)` (line 230), add:

```ts
        notifyNectrResult(res?.nectrSchedule ?? null)
```

- [ ] **Step 6: Typecheck + focused tests** — `npx tsc --noEmit`; `npx vitest run tests/server/actions/relay-nectr-schedule.test.ts` → clean/PASS.
- [ ] **Step 7: Commit**

```bash
git add "src/server/actions/relay.ts" "src/components/relay/checklist-panel.tsx" "tests/server/actions/relay-nectr-schedule.test.ts"
git commit -m "feat(nectr): schedule on finish + toast/retry (best-effort)"
```

---

### Task 6: Connect / manage accounts deep-link

**Files:**
- Modify: `src/lib/nectr.ts` (add `nectrConnectUrl`)
- Modify: `src/components/clients/client-profile-view.tsx` (link in the Scheduling section)
- Test: `tests/lib/nectr.test.ts`

**Interfaces:** Produces `nectrConnectUrl(locationId: string): string`.

- [ ] **Step 1: Write the failing test** — `tests/lib/nectr.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { nectrConnectUrl } from '@/lib/nectr'

describe('nectrConnectUrl', () => {
  it('builds the sub-account social-planner URL from a location id', () => {
    expect(nectrConnectUrl('LOC123')).toBe('https://app.nectrcrm.com/v2/location/LOC123/marketing/social-planner')
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/lib/nectr.test.ts` → FAIL.

- [ ] **Step 3: Implement** — in `src/lib/nectr.ts`, add (reusing the existing `NECTR_CRM_URL`):

```ts
/** Deep-link to a client's NECTR sub-account Social Planner, where an AM connects
 * social accounts (an OAuth flow GHL's UI handles). Confirm the exact sub-path
 * against a live NECTR sub-account; social-planner is the connect entry point. */
export function nectrConnectUrl(locationId: string): string {
  return `${NECTR_CRM_URL}/v2/location/${locationId}/marketing/social-planner`
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/lib/nectr.test.ts` → PASS.

- [ ] **Step 5: Add the link** — in `src/components/clients/client-profile-view.tsx`, add the import near the other imports:

```ts
import { nectrConnectUrl } from '@/lib/nectr'
```

Then, in the Scheduling `PageSection`, immediately after `{canEdit && <NectrConnectionCheck clientId={client.id} />}` (from Phase 1), add:

```tsx
        {canEdit && client.nectrLocationId && (
          <a
            href={nectrConnectUrl(client.nectrLocationId)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-[12px] text-muted-foreground underline hover:text-foreground"
          >
            Connect / manage accounts in NECTR ↗
          </a>
        )}
```

- [ ] **Step 6: Typecheck** — `npx tsc --noEmit` → clean.
- [ ] **Step 7: Commit**

```bash
git add src/lib/nectr.ts "src/components/clients/client-profile-view.tsx" tests/lib/nectr.test.ts
git commit -m "feat(nectr): connect/manage accounts deep-link on the client profile"
```

---

### Task 7: Finalize — full green gate + PR

- [ ] **Step 1: Full gate**

```bash
npx tsc --noEmit
npx vitest run
npx next build
npx eslint .
```

All clean (distinguish pre-existing repo failures — the DB-integration suite needs a live test DB, and repo-wide eslint noise — from anything in the NECTR files; fix only ours). Note: the integration/schema-drift validation of the `Post.nectrScheduledId` migration happens in CI, not locally.

- [ ] **Step 2: Push + PR**

```bash
git push -u origin feat/nectr-scheduling-phase2
gh pr create --base main --title "NECTR auto-scheduling Phase 2: true-scheduled push" --body "Phase 2 — automatic true-scheduling of a batch's posts into the client's NECTR Social Planner on the scheduling step (8am location-local, all connected accounts), mirroring the #425 Drive upload. Idempotent via Post.nectrScheduledId. The manual CSV export stays untouched as a failsafe. Adds a connect/manage-accounts deep-link. Timezone wire format validated by the Task 1 spike. Requires NECTR_AGENCY_TOKEN for live use; skips cleanly otherwise. Spec + plan in docs/superpowers/."
```

---

## Self-Review

**Spec coverage:** wrapper `createPost` → Task 2; `Post.nectrScheduledId` + migration → Task 3; the push service (skip reasons, ok/partial, idempotency, expired-filter, 8am scheduleDate, `buildContent` reuse) → Task 4; `finishBatchAction` hook + retry + toast → Task 5; connect deep-link → Task 6; timezone spike → Task 1; gate + PR → Task 7.

**Deviation from the spec (deliberate):** the spec listed `getLocation` + explicit timezone resolution. The plan drops it (YAGNI): the CSV proves NECTR applies the location's timezone to a tz-naive `08:00`, so `buildNectrScheduleDate` emits tz-naive local and no per-run tz lookup is needed. Task 1's spike is the gate; if it shows NECTR honors UTC instead, Task 2 gains `getLocation` and Task 4 converts local→UTC (flagged in Task 1 Step 3).

**Placeholder scan:** none. The one runtime value to confirm (the exact `scheduleDate` string, and the exact NECTR connect sub-path) are named as explicit validation/confirmation steps, not left vague in code.

**Type consistency:** `NectrScheduleResult`, `scheduleBatchToNectr`, `createPost`/`CreatePostInput`, `buildNectrScheduleDate`, `nectrConnectUrl` are declared once and consumed with the same signatures across Tasks 4-6. `finishBatchAction` returns `{ ...result, driveUpload, nectrSchedule }`; `checklist-panel` reads `res?.nectrSchedule`.

## Global note for the implementer

`NECTR_AGENCY_TOKEN` (Caleb) is an external precondition. All tasks build and unit-test WITHOUT it (mocked wrapper). Only Task 1's live spike and a real end-to-end run need it (or, for the spike, the internal FON PIT via curl). This writes real scheduled posts to live accounts, so Task 1 must confirm the timezone before any client batch is run through it.
