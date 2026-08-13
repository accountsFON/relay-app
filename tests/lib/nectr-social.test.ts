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

  it('sends an empty media array when no url is given (the API requires media)', async () => {
    const fetchImpl = vi.fn(async () =>
      ({ ok: true, status: 201, json: async () => ({ results: { post: { _id: 'p2' } } }), text: async () => '' }) as unknown as Response,
    ) as unknown as typeof fetch
    await createPost('loc1', { accountIds: ['a'], summary: 's', scheduleDate: '2026-09-01T08:00:00.000Z', userId: 'u' }, { fetchImpl, token: 't' })
    const body = JSON.parse((vi.mocked(fetchImpl).mock.calls[0][1] as RequestInit).body as string)
    expect(body.media).toEqual([])
  })

  it('throws NectrApiError on a non-2xx response', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 422, json: async () => ({}), text: async () => 'bad' }) as unknown as Response) as unknown as typeof fetch
    await expect(
      createPost('loc1', { accountIds: ['a'], summary: 's', scheduleDate: 'x', userId: 'u' }, { fetchImpl, token: 't' }),
    ).rejects.toBeInstanceOf(NectrApiError)
  })
})
