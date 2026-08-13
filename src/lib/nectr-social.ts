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
  // The API requires `media` on every post (a 422 "media must be an array with
  // media objects or an empty array" otherwise). Send [] for a text post,
  // [{url,type}] when there is an image. Confirmed live in the Task 1 spike.
  body.media = input.mediaUrl
    ? [{ url: input.mediaUrl, type: input.mediaType ?? 'image/jpeg' }]
    : []
  const json = (await nectrPost(`/social-media-posting/${locationId}/posts`, body, deps)) as {
    results?: { post?: { _id?: string } }
  }
  const id = json.results?.post?._id
  if (!id) throw new NectrApiError(200, 'NECTR create-post returned no post id')
  return { id }
}
