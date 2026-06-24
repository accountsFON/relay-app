import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- Hoisted mocks ----
//
// Anthropic SDK: capture the args to messages.create so we can assert the
// prompt content; respond with a configurable rewrite.
const { mockMessagesCreate } = vi.hoisted(() => ({
  mockMessagesCreate: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => {
  const AnthropicMock = vi.fn().mockImplementation(function () {
    return {
      messages: {
        create: mockMessagesCreate,
      },
    }
  })
  return { default: AnthropicMock }
})

// In-memory DB. We model just enough of the Prisma surface for the two
// fixWithAi entry points: post.findUnique (with include), postThread.findUnique
// (with include + with comments), postVersion.create, post.update, and
// $transaction. The transaction proxies straight through to the same mock
// methods — atomicity is not under test here.
//
// The db state lives inside the hoisted block so it's initialized before the
// vi.mock factory runs (vi.mock is hoisted above all top-level statements).
type PostRow = {
  id: string
  clientId: string
  caption: string
  hashtags: string[]
  graphicHook: string | null
  designerNotes: string | null
  client: {
    name: string
    brandVoice: string | null
    dos: string | null
    donts: string | null
  }
}

type ThreadRow = {
  id: string
  postId: string
  status: 'open' | 'resolved'
  comments: Array<{
    body: string
    reviewerName: string | null
    author: { name: string | null } | null
    createdAt: Date
  }>
  resolvedBy?: string | null
  resolvedReason?: string | null
  resolvedAt?: Date | null
}

type VersionRow = {
  id: string
  postId: string
  authorId: string | null
  caption: string
  hashtags: string[]
  graphicHook: string | null
  designerNotes: string | null
}

const { state, dbMock } = vi.hoisted(() => {
  type LocalPostRow = {
    id: string
    clientId: string
    caption: string
    hashtags: string[]
    graphicHook: string | null
    designerNotes: string | null
    client: {
      name: string
      brandVoice: string | null
      dos: string | null
      donts: string | null
    }
  }
  type LocalThreadRow = {
    id: string
    postId: string
    status: 'open' | 'resolved'
    captionFrom?: number | null
    captionTo?: number | null
    imageX?: number | null
    imageY?: number | null
    comments: Array<{
      body: string
      reviewerName: string | null
      author: { name: string | null } | null
      createdAt: Date
    }>
    resolvedBy?: string | null
    resolvedReason?: string | null
    resolvedAt?: Date | null
  }
  type LocalVersionRow = {
    id: string
    postId: string
    authorId: string | null
    caption: string
    hashtags: string[]
    graphicHook: string | null
    designerNotes: string | null
  }
  type LocalReviewItemRow = {
    decision: string
    suggestedCaption: string | null
  }
  const localState = {
    posts: new Map<string, LocalPostRow>(),
    threads: new Map<string, LocalThreadRow>(),
    versions: [] as LocalVersionRow[],
    versionCounter: 0,
    reviewItem: null as LocalReviewItemRow | null,
  }
  const localDb = {
    post: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return localState.posts.get(where.id) ?? null
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string }
          data: Partial<LocalPostRow>
        }) => {
          const row = localState.posts.get(where.id)
          if (!row) throw new Error(`post ${where.id} not found`)
          Object.assign(row, data)
          return row
        },
      ),
    },
    postThread: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return localState.threads.get(where.id) ?? null
      }),
      findMany: vi.fn(async ({ where }: { where: { postId: string } }) => {
        return Array.from(localState.threads.values()).filter(
          (t) => t.postId === where.postId,
        )
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string }
          data: Partial<LocalThreadRow>
        }) => {
          const row = localState.threads.get(where.id)
          if (!row) throw new Error(`thread ${where.id} not found`)
          Object.assign(row, data)
          return row
        },
      ),
    },
    postVersion: {
      create: vi.fn(async ({ data }: { data: Omit<LocalVersionRow, 'id'> }) => {
        localState.versionCounter += 1
        const row: LocalVersionRow = {
          id: `v_${localState.versionCounter}`,
          ...data,
        }
        localState.versions.push(row)
        return { id: row.id }
      }),
      count: vi.fn(async () => 1),
      findMany: vi.fn(async () => []),
    },
    reviewItem: {
      findFirst: vi.fn(async () => localState.reviewItem),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
      return cb(localDb)
    }),
  }
  return { state: localState, dbMock: localDb }
})

vi.mock('@/db/client', () => ({
  db: dbMock,
}))

// recordActivity: capture every call so we can assert payload shape.
const { mockRecordActivity } = vi.hoisted(() => ({
  mockRecordActivity: vi.fn<(input: Record<string, unknown>) => Promise<{ id: string } | null>>(
    async () => ({ id: 'ae_1' }),
  ),
}))

vi.mock('@/server/services/activity', async () => {
  const actual =
    await vi.importActual<typeof import('@/server/services/activity')>(
      '@/server/services/activity',
    )
  return {
    ...actual,
    recordActivity: mockRecordActivity,
  }
})

// resolveThread: the repository wraps its own txn we'd rather not simulate.
// Mock it to update our in-memory thread state so assertions stay readable.
const { mockResolveThread } = vi.hoisted(() => ({
  mockResolveThread: vi.fn(),
}))

vi.mock('@/server/repositories/threads', () => ({
  resolveThread: mockResolveThread,
}))

// snapshotPostVersion: per-post accept flow uses the shared helper rather than
// writing postVersion.create directly. Mock it so we can assert call shape and
// return a deterministic version id.
const { mockSnapshotPostVersion } = vi.hoisted(() => ({
  mockSnapshotPostVersion: vi.fn<() => Promise<{ id: string } | null>>(async () => ({ id: 'pv-new' })),
}))

vi.mock('@/server/services/postVersions', () => ({
  snapshotPostVersion: mockSnapshotPostVersion,
}))

import { ActivityKind } from '@prisma/client'
import { proposeFix, acceptFix } from '@/server/services/fixWithAi'

function resetState() {
  state.posts.clear()
  state.threads.clear()
  state.versions.length = 0
  state.versionCounter = 0
  state.reviewItem = null
  mockMessagesCreate.mockReset()
  mockRecordActivity.mockReset()
  mockRecordActivity.mockResolvedValue({ id: 'ae_1' })
  mockSnapshotPostVersion.mockReset()
  mockSnapshotPostVersion.mockResolvedValue({ id: 'pv-new' })
  mockResolveThread.mockReset()
  mockResolveThread.mockImplementation(async (input: {
    threadId: string
    resolvedBy: string
    resolvedReason: string | null
  }) => {
    const row = state.threads.get(input.threadId)
    if (!row) return
    row.status = 'resolved'
    row.resolvedBy = input.resolvedBy
    row.resolvedReason = input.resolvedReason
    row.resolvedAt = new Date()
  })
  for (const key of Object.keys(dbMock) as Array<keyof typeof dbMock>) {
    const entry = dbMock[key]
    if (typeof entry === 'function') {
      ;(entry as ReturnType<typeof vi.fn>).mockClear()
    } else {
      for (const m of Object.values(entry)) {
        if (typeof m === 'function') (m as ReturnType<typeof vi.fn>).mockClear()
      }
    }
  }
}

function seedPost(overrides: Partial<PostRow> = {}): PostRow {
  const post: PostRow = {
    id: 'p_1',
    clientId: 'c_1',
    caption: 'Welcome to our new patio space. Sundays are quiet.',
    hashtags: ['#patio'],
    graphicHook: null,
    designerNotes: null,
    client: {
      name: 'Acme Co',
      brandVoice: 'warm and direct',
      dos: 'always end with a question',
      donts: 'never say cheap',
    },
    ...overrides,
  }
  state.posts.set(post.id, post)
  return post
}

function seedThread(overrides: Partial<ThreadRow> = {}): ThreadRow {
  const thread: ThreadRow = {
    id: 't_1',
    postId: 'p_1',
    status: 'open',
    comments: [
      {
        body: 'can we say "outdoor seating area" instead of "patio space"?',
        reviewerName: null,
        author: { name: 'Caleb' },
        createdAt: new Date('2026-05-15T10:00:00Z'),
      },
    ],
    ...overrides,
  }
  state.threads.set(thread.id, thread)
  return thread
}

function mockProposalResponse(text: string) {
  mockMessagesCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text }],
    usage: { input_tokens: 1234, output_tokens: 87 },
  })
}

beforeEach(() => {
  resetState()
})

// ---------------------------------------------------------------------------
// Seed helpers for per-post tests
// ---------------------------------------------------------------------------

function seedPostForPerPost() {
  const post = {
    id: 'post-1',
    clientId: 'client-1',
    caption: 'Original caption',
    hashtags: [] as string[],
    graphicHook: null,
    designerNotes: null,
    client: {
      name: 'Test Client',
      brandVoice: 'friendly',
      dos: 'be clear',
      donts: 'no jargon',
    },
  }
  state.posts.set(post.id, post)
  return post
}

function seedThreadsForPerPost() {
  // Caption pin thread (captionFrom set, imageX null)
  const captionThread = {
    id: 'thread-caption',
    postId: 'post-1',
    status: 'open' as const,
    captionFrom: 5,
    captionTo: 10,
    imageX: null,
    imageY: null,
    comments: [
      {
        body: 'shorten',
        reviewerName: 'Client',
        author: null,
        createdAt: new Date('2026-06-01T10:00:00Z'),
      },
    ],
  }
  // Post-level thread (all coords null)
  const postThread = {
    id: 'thread-post',
    postId: 'post-1',
    status: 'open' as const,
    captionFrom: null,
    captionTo: null,
    imageX: null,
    imageY: null,
    comments: [
      {
        body: 'add CTA',
        reviewerName: 'Client',
        author: null,
        createdAt: new Date('2026-06-01T11:00:00Z'),
      },
    ],
  }
  state.threads.set(captionThread.id, captionThread)
  state.threads.set(postThread.id, postThread)
  return [captionThread, postThread]
}

function seedReviewItem() {
  state.reviewItem = { decision: 'changes_requested', suggestedCaption: 'Client draft' }
}

// ---------------------------------------------------------------------------

describe('proposeFix', () => {
  it('includes client brandVoice, dos, and donts in the prompt sent to the model', async () => {
    seedPost()
    seedThread()
    mockProposalResponse(
      'Welcome to our new outdoor seating area. Sundays are quiet.',
    )

    await proposeFix({ postId: 'p_1', threadId: 't_1' })

    expect(mockMessagesCreate).toHaveBeenCalledOnce()
    const args = mockMessagesCreate.mock.calls[0][0]
    const promptText =
      args.system + '\n' + args.messages.map((m: { content: string }) => m.content).join('\n')
    expect(promptText).toContain('Acme Co')
    expect(promptText).toContain('warm and direct')
    expect(promptText).toContain('always end with a question')
    expect(promptText).toContain('never say cheap')
    expect(promptText).toContain('Welcome to our new patio space')
    expect(promptText).toContain('outdoor seating area')
  })

  it('returns a diff that locates inserts and deletes in the rewritten caption', async () => {
    seedPost({ caption: 'Welcome to our new patio space. Sundays are quiet.' })
    seedThread()
    mockProposalResponse(
      'Welcome to our new outdoor seating area. Sundays are quiet.',
    )

    const result = await proposeFix({ postId: 'p_1', threadId: 't_1' })

    expect(result.diff.length).toBeGreaterThan(1)
    // Diff must contain at least one equal/insert/delete and the round-trip
    // of the segments must reconstruct old and new strings.
    const types = new Set(result.diff.map((s) => s.type))
    expect(types.has('equal')).toBe(true)
    expect(types.has('insert')).toBe(true)
    expect(types.has('delete')).toBe(true)

    const oldRebuilt = result.diff
      .filter((s) => s.type === 'equal' || s.type === 'delete')
      .map((s) => s.text)
      .join('')
    const newRebuilt = result.diff
      .filter((s) => s.type === 'equal' || s.type === 'insert')
      .map((s) => s.text)
      .join('')
    expect(oldRebuilt).toBe('Welcome to our new patio space. Sundays are quiet.')
    expect(newRebuilt).toBe(
      'Welcome to our new outdoor seating area. Sundays are quiet.',
    )

    // Token usage round-trips through the cost calculator.
    expect(result.tokenUsage.in).toBe(1234)
    expect(result.tokenUsage.out).toBe(87)
    expect(result.tokenUsage.costUsd).toBeGreaterThan(0)
  })
})

describe('acceptFix', () => {
  it('creates a new PostVersion snapshotting the proposed caption', async () => {
    seedPost()
    seedThread()

    const result = await acceptFix({
      postId: 'p_1',
      threadId: 't_1',
      proposedCaption: 'new caption text',
      acceptedBy: 'u_am',
    })

    expect(result.postVersionId).toBe('v_1')
    expect(state.versions).toHaveLength(1)
    expect(state.versions[0]).toMatchObject({
      postId: 'p_1',
      authorId: 'u_am',
      caption: 'new caption text',
    })
    // Post.caption is now the new text.
    expect(state.posts.get('p_1')?.caption).toBe('new caption text')
  })

  it('auto-resolves the originating thread with the canonical reason', async () => {
    seedPost()
    seedThread()

    await acceptFix({
      postId: 'p_1',
      threadId: 't_1',
      proposedCaption: 'new caption',
      acceptedBy: 'u_am',
    })

    expect(mockResolveThread).toHaveBeenCalledWith({
      threadId: 't_1',
      resolvedBy: 'u_am',
      resolvedReason: 'Resolved via Fix with AI',
    })
    const thread = state.threads.get('t_1')!
    expect(thread.status).toBe('resolved')
    expect(thread.resolvedReason).toBe('Resolved via Fix with AI')
    expect(thread.resolvedBy).toBe('u_am')
  })

  it('emits a post_caption_ai_fixed ActivityEvent with the correct payload', async () => {
    seedPost({ caption: 'old caption text' })
    seedThread()

    await acceptFix({
      postId: 'p_1',
      threadId: 't_1',
      proposedCaption: 'new caption text',
      acceptedBy: 'u_am',
    })

    expect(mockRecordActivity).toHaveBeenCalledOnce()
    const call = mockRecordActivity.mock.calls[0]?.[0] as {
      clientId: string
      postId: string | null | undefined
      actorId: string | null | undefined
      kind: ActivityKind
      payload: Record<string, unknown>
    }
    expect(call.clientId).toBe('c_1')
    expect(call.postId).toBe('p_1')
    expect(call.actorId).toBe('u_am')
    expect(call.kind).toBe(ActivityKind.post_caption_ai_fixed)
    expect(call.payload).toEqual({
      postId: 'p_1',
      threadId: 't_1',
      oldCaption: 'old caption text',
      newCaption: 'new caption text',
      postVersionId: 'v_1',
    })
  })
})

// ---------------------------------------------------------------------------
// Per-post variants
// ---------------------------------------------------------------------------

describe('proposeFixForPost', () => {
  beforeEach(() => {
    mockMessagesCreate.mockReset()
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Rewritten from all feedback' }],
      usage: { input_tokens: 100, output_tokens: 20 },
    })
  })

  it('feeds verdict + suggested caption + every pin comment to the model', async () => {
    seedPostForPerPost()
    seedThreadsForPerPost()
    seedReviewItem()

    const { proposeFixForPost } = await import('@/server/services/fixWithAi')
    const result = await proposeFixForPost({ postId: 'post-1' })

    expect(mockMessagesCreate).toHaveBeenCalledTimes(1)
    const userPrompt = mockMessagesCreate.mock.calls[0][0].messages[0].content as string
    expect(userPrompt).toContain('Original caption')
    expect(userPrompt.toLowerCase()).toContain('changes')
    expect(userPrompt).toContain('Client draft')
    expect(userPrompt).toContain('shorten')
    expect(userPrompt).toContain('add CTA')

    expect(result.proposedCaption).toBe('Rewritten from all feedback')
    expect(
      result.diff.filter((s) => s.type === 'equal' || s.type === 'delete').map((s) => s.text).join(''),
    ).toBe('Original caption')
    expect(result.tokenUsage.in).toBeGreaterThan(0)
  })
})

describe('acceptFixForPost', () => {
  it('snapshots via the shared helper, updates the caption, records activity, and does NOT resolve threads', async () => {
    seedPostForPerPost()
    seedThreadsForPerPost()

    const { acceptFixForPost } = await import('@/server/services/fixWithAi')
    const { snapshotPostVersion } = await import('@/server/services/postVersions')
    const { recordActivity } = await import('@/server/services/activity')
    const { resolveThread } = await import('@/server/repositories/threads')

    const res = await acceptFixForPost({ postId: 'post-1', proposedCaption: 'Accepted caption', acceptedBy: 'user-am' })

    expect(snapshotPostVersion).toHaveBeenCalledWith(
      expect.objectContaining({ postId: 'post-1', authorId: 'user-am', body: expect.objectContaining({ caption: 'Accepted caption' }) }),
      expect.anything(),
    )
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ kind: 'post_caption_ai_fixed', postId: 'post-1' }))
    expect(resolveThread).not.toHaveBeenCalled()
    expect(res.postVersionId).toBeTypeOf('string')
  })
})
