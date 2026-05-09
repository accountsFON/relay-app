import { describe, it, expect, vi, beforeEach } from 'vitest'

// Build an in-memory PostVersion table for the trim-cap test.
type Row = {
  id: string
  postId: string
  authorId: string | null
  caption: string
  hashtags: string[]
  graphicHook: string | null
  designerNotes: string | null
  createdAt: Date
}

const rows: Row[] = []
let counter = 0

vi.mock('@/db/client', () => ({
  db: {
    postVersion: {
      create: vi.fn(async ({ data }: { data: Omit<Row, 'id' | 'createdAt'> }) => {
        counter += 1
        const row: Row = {
          id: `v_${counter}`,
          createdAt: new Date(2026, 0, counter),
          ...data,
        }
        rows.push(row)
        return { id: row.id }
      }),
      count: vi.fn(async ({ where }: { where: { postId: string } }) =>
        rows.filter((r) => r.postId === where.postId).length,
      ),
      findMany: vi.fn(async ({ where, take }: { where: { postId: string }; take: number }) => {
        const subset = rows
          .filter((r) => r.postId === where.postId)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .slice(0, take)
        return subset.map((r) => ({ id: r.id }))
      }),
      deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        for (const id of where.id.in) {
          const idx = rows.findIndex((r) => r.id === id)
          if (idx !== -1) rows.splice(idx, 1)
        }
        return { count: where.id.in.length }
      }),
    },
  },
}))

import { snapshotPostVersion } from '@/server/services/postVersions'

beforeEach(() => {
  rows.length = 0
  counter = 0
})

describe('snapshotPostVersion', () => {
  it('appends a new version with the body', async () => {
    const result = await snapshotPostVersion({
      postId: 'p1',
      authorId: 'u1',
      body: { caption: 'hi', hashtags: ['#a'], graphicHook: null, designerNotes: null },
    })
    expect(result?.id).toBe('v_1')
    expect(rows).toHaveLength(1)
    expect(rows[0].caption).toBe('hi')
  })

  it('caps history at 50 entries by trimming oldest', async () => {
    for (let i = 0; i < 55; i++) {
      await snapshotPostVersion({
        postId: 'p2',
        authorId: 'u1',
        body: { caption: `v${i}`, hashtags: [], graphicHook: null, designerNotes: null },
      })
    }
    const remaining = rows.filter((r) => r.postId === 'p2')
    expect(remaining).toHaveLength(50)
    // oldest 5 (v0–v4) trimmed; first remaining caption should be v5
    expect(remaining[0].caption).toBe('v5')
    expect(remaining[remaining.length - 1].caption).toBe('v54')
  })

  it('does not affect other posts when trimming', async () => {
    await snapshotPostVersion({
      postId: 'pA',
      authorId: null,
      body: { caption: 'A', hashtags: [], graphicHook: null, designerNotes: null },
    })
    for (let i = 0; i < 55; i++) {
      await snapshotPostVersion({
        postId: 'pB',
        authorId: null,
        body: { caption: `B${i}`, hashtags: [], graphicHook: null, designerNotes: null },
      })
    }
    expect(rows.filter((r) => r.postId === 'pA')).toHaveLength(1)
    expect(rows.filter((r) => r.postId === 'pB')).toHaveLength(50)
  })
})
