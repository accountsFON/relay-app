import { describe, it, expect } from 'vitest'
import {
  buildRollupContent,
  buildRollupSubject,
  ROLLUP_WINDOW_MS,
  ROLLUP_MAX_AGE_MS,
  EXCLUDED_ROLLUP_KINDS,
} from '@/lib/notification-email-rollup'
import type { MentionInboxRow } from '@/components/activity/types'

const BASE = 'https://relay.example.com'

function row(
  over: {
    mentionId?: string
    clientId?: string
    clientName?: string
    kind?: string
    actorName?: string
    postId?: string | null
    postBatchId?: string | null
    createdAt?: Date
    payload?: Record<string, unknown>
  } = {},
): MentionInboxRow {
  const clientId = over.clientId ?? 'client_1'
  return {
    mentionId: over.mentionId ?? 'm1',
    readAt: null,
    client: { id: clientId, name: over.clientName ?? 'Elevated Tree Solutions' },
    postBatchId: over.postBatchId ?? null,
    event: {
      id: 'evt_1',
      clientId,
      runId: null,
      postId: over.postId ?? null,
      kind: (over.kind ?? 'post_comment_added') as never,
      createdAt: over.createdAt ?? new Date('2026-09-02T14:00:00Z'),
      actor: { id: 'u_actor', name: over.actorName ?? 'Mollie', avatarUrl: null },
      // postNumber makes renderSummary's postRef() deterministic ("Post 3")
      // instead of falling back to a short-hash of an absent postId.
      payload: (over.payload ?? { postNumber: 3 }) as never,
    },
  } as MentionInboxRow
}

describe('constants', () => {
  it('window is 5 minutes and max age is 24 hours', () => {
    expect(ROLLUP_WINDOW_MS).toBe(5 * 60 * 1000)
    expect(ROLLUP_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000)
  })

  it('excludes exactly the three bespoke-email kinds', () => {
    expect([...EXCLUDED_ROLLUP_KINDS].sort()).toEqual([
      'batch_passed',
      'batch_sent_back',
      'review_session_submitted',
    ])
  })
})

describe('buildRollupContent', () => {
  it('strips the client name prefix from each summary line', () => {
    // renderSummary prefixes every line with "ClientName · ". The email
    // groups by client, so repeating it on every line is noise.
    const content = buildRollupContent([row({ actorName: 'Mollie' })], BASE)

    expect(content.groups[0].items[0].summary).toBe('Mollie replied on Post 3.')
    expect(content.groups[0].items[0].summary).not.toContain('Elevated Tree Solutions ·')
  })

  it('makes every href absolute', () => {
    const content = buildRollupContent([row()], BASE)

    expect(content.groups[0].items[0].href.startsWith(`${BASE}/`)).toBe(true)
  })

  it('groups by client, sorted by client name', () => {
    const content = buildRollupContent(
      [
        row({ mentionId: 'm1', clientId: 'c_z', clientName: 'Zeta Co' }),
        row({ mentionId: 'm2', clientId: 'c_a', clientName: 'Alpha Co' }),
      ],
      BASE,
    )

    expect(content.groups.map((g) => g.clientName)).toEqual(['Alpha Co', 'Zeta Co'])
    expect(content.totalCount).toBe(2)
    expect(content.clientCount).toBe(2)
  })

  it('orders items within a client oldest first', () => {
    const content = buildRollupContent(
      [
        row({ mentionId: 'm1', actorName: 'Later', createdAt: new Date('2026-09-02T14:05:00Z') }),
        row({ mentionId: 'm2', actorName: 'Earlier', createdAt: new Date('2026-09-02T14:01:00Z') }),
      ],
      BASE,
    )

    expect(content.groups[0].items.map((i) => i.summary)).toEqual([
      'Earlier replied on Post 3.',
      'Later replied on Post 3.',
    ])
  })
})

describe('buildRollupSubject', () => {
  it('names the client and the event for a single item', () => {
    const content = buildRollupContent([row({ actorName: 'Mollie' })], BASE)

    expect(buildRollupSubject(content)).toBe(
      '[Relay] Elevated Tree Solutions: Mollie replied on Post 3.',
    )
  })

  it('counts items for several on one client', () => {
    const content = buildRollupContent(
      [row({ mentionId: 'm1' }), row({ mentionId: 'm2' }), row({ mentionId: 'm3' })],
      BASE,
    )

    expect(buildRollupSubject(content)).toBe(
      '[Relay] 3 updates on Elevated Tree Solutions',
    )
  })

  it('counts clients for several across clients', () => {
    const content = buildRollupContent(
      [
        row({ mentionId: 'm1', clientId: 'c1', clientName: 'Alpha Co' }),
        row({ mentionId: 'm2', clientId: 'c2', clientName: 'Beta Co' }),
        row({ mentionId: 'm3', clientId: 'c2', clientName: 'Beta Co' }),
      ],
      BASE,
    )

    expect(buildRollupSubject(content)).toBe('[Relay] 3 updates across 2 clients')
  })
})
