import { describe, it, expect, vi } from 'vitest'
import {
  autoFlagClientPins,
  type AutoFlagDeps,
  type ClientPinRow,
} from '@/server/services/autoFlagClientPins'

const AM = 'user_am_1'
const BATCH = 'batch_1'

function imagePin(id: string, postId = 'post_1'): ClientPinRow {
  return { id, postId, imageX: 30, imageY: 40, captionFrom: null, captionTo: null }
}

function captionPin(id: string, postId = 'post_1'): ClientPinRow {
  return { id, postId, imageX: null, imageY: null, captionFrom: 0, captionTo: 12 }
}

function postNote(id: string, postId = 'post_1'): ClientPinRow {
  return { id, postId, imageX: null, imageY: null, captionFrom: null, captionTo: null }
}

function makeDeps(
  over: Partial<AutoFlagDeps> & { pins?: ClientPinRow[]; flaggedThreadIds?: string[] } = {},
): AutoFlagDeps & { created: Parameters<AutoFlagDeps['createFlag']>[0][] } {
  const created: Parameters<AutoFlagDeps['createFlag']>[0][] = []
  const deps: AutoFlagDeps = {
    listOpenClientPins: vi.fn().mockResolvedValue(over.pins ?? []),
    listFlaggedThreadIds: vi.fn().mockResolvedValue(new Set(over.flaggedThreadIds ?? [])),
    createFlag: vi.fn(async (input) => {
      created.push(input)
      return { id: `flag_${created.length}` }
    }),
    ...over,
  }
  return Object.assign(deps, { created })
}

describe('autoFlagClientPins', () => {
  it('flags an image pin the client left', async () => {
    const deps = makeDeps({ pins: [imagePin('t1')] })

    const result = await autoFlagClientPins({ batchId: BATCH, createdById: AM }, deps)

    expect(result).toEqual({ flagged: 1, skippedCaption: 0, skippedExisting: 0 })
    expect(deps.created).toEqual([
      { batchId: BATCH, postId: 'post_1', threadId: 't1', note: null, createdById: AM },
    ])
  })

  it('flags a post-level note (no coordinates at all)', async () => {
    const deps = makeDeps({ pins: [postNote('t1')] })

    const result = await autoFlagClientPins({ batchId: BATCH, createdById: AM }, deps)

    expect(result.flagged).toBe(1)
    expect(deps.created[0]?.threadId).toBe('t1')
  })

  it('never flags a caption pin, because caption edits are the AM’s work', async () => {
    // review-feedback-rail hides the flag control for caption edits: the AM
    // accepts or rejects that copy inline, it is not designer work.
    const deps = makeDeps({ pins: [captionPin('t1')] })

    const result = await autoFlagClientPins({ batchId: BATCH, createdById: AM }, deps)

    expect(result).toEqual({ flagged: 0, skippedCaption: 1, skippedExisting: 0 })
    expect(deps.createFlag).not.toHaveBeenCalled()
  })

  it('skips a pin that already carries a flag, so re-submit cannot duplicate', async () => {
    const deps = makeDeps({ pins: [imagePin('t1')], flaggedThreadIds: ['t1'] })

    const result = await autoFlagClientPins({ batchId: BATCH, createdById: AM }, deps)

    expect(result).toEqual({ flagged: 0, skippedCaption: 0, skippedExisting: 1 })
    expect(deps.createFlag).not.toHaveBeenCalled()
  })

  it('flags a round-2 pin while leaving the already-flagged round-1 pin alone', async () => {
    const deps = makeDeps({
      pins: [imagePin('t1'), imagePin('t2', 'post_2')],
      flaggedThreadIds: ['t1'],
    })

    const result = await autoFlagClientPins({ batchId: BATCH, createdById: AM }, deps)

    expect(result).toEqual({ flagged: 1, skippedCaption: 0, skippedExisting: 1 })
    expect(deps.created).toHaveLength(1)
    expect(deps.created[0]?.threadId).toBe('t2')
    expect(deps.created[0]?.postId).toBe('post_2')
  })

  it('attributes every flag to the passed creator, never to the client', async () => {
    // DesignerFlag.createdById is a required User FK and a magic-link reviewer
    // is not a User, so the caller passes MagicLink.createdBy.
    const deps = makeDeps({ pins: [imagePin('t1'), postNote('t2', 'post_2')] })

    await autoFlagClientPins({ batchId: BATCH, createdById: AM }, deps)

    expect(deps.created.every((f) => f.createdById === AM)).toBe(true)
  })

  it('leaves the note empty so the rail renders its own "Revise this item" copy', async () => {
    const deps = makeDeps({ pins: [imagePin('t1')] })

    await autoFlagClientPins({ batchId: BATCH, createdById: AM }, deps)

    expect(deps.created[0]?.note).toBeNull()
  })

  it('handles a mixed batch and reports accurate counts', async () => {
    const deps = makeDeps({
      pins: [
        imagePin('t1'),
        captionPin('t2'),
        postNote('t3', 'post_2'),
        imagePin('t4', 'post_3'),
        captionPin('t5', 'post_3'),
      ],
      flaggedThreadIds: ['t4'],
    })

    const result = await autoFlagClientPins({ batchId: BATCH, createdById: AM }, deps)

    expect(result).toEqual({ flagged: 2, skippedCaption: 2, skippedExisting: 1 })
    expect(deps.created.map((f) => f.threadId)).toEqual(['t1', 't3'])
  })

  it('does nothing when the client left no pins', async () => {
    const deps = makeDeps({ pins: [] })

    const result = await autoFlagClientPins({ batchId: BATCH, createdById: AM }, deps)

    expect(result).toEqual({ flagged: 0, skippedCaption: 0, skippedExisting: 0 })
    expect(deps.createFlag).not.toHaveBeenCalled()
  })

  it('scopes both lookups to the batch it was given', async () => {
    const deps = makeDeps({ pins: [imagePin('t1')] })

    await autoFlagClientPins({ batchId: BATCH, createdById: AM }, deps)

    expect(deps.listOpenClientPins).toHaveBeenCalledWith(BATCH)
    expect(deps.listFlaggedThreadIds).toHaveBeenCalledWith(BATCH)
  })
})

// The scoping that keeps internal pins out lives in the default deps' query,
// not in the pure loop above, so it needs its own guard. This is the same class
// of bug as the magic-link pin leak fixed in PR #432: an unscoped thread query
// on a surface that must only ever see client-authored rows.
describe('autoFlagClientPins default query scoping', () => {
  it('only ever reads OPEN, CLIENT-authored threads on the given batch', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    vi.doMock('@/db/client', () => ({
      db: {
        postThread: { findMany },
        designerFlag: { findMany: vi.fn().mockResolvedValue([]) },
      },
    }))
    vi.resetModules()
    const { autoFlagClientPins: fresh } = await import(
      '@/server/services/autoFlagClientPins'
    )

    await fresh({ batchId: 'batch_9', createdById: 'user_am_1' })

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          post: { batchId: 'batch_9' },
          status: 'open',
          reviewerToken: { not: null },
        },
      }),
    )
    vi.doUnmock('@/db/client')
    vi.resetModules()
  })
})
