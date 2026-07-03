// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/client', () => ({
  db: {
    designerFlag: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
  },
}))

import { db } from '@/db/client'
import {
  createDesignerFlag,
  updateDesignerFlagNote,
  deleteDesignerFlag,
  setDesignerFlagDone,
  listDesignerFlagsForBatch,
  designerFlagCounts,
  findDesignerFlagForAuth,
} from '@/server/repositories/designerFlags'

beforeEach(() => vi.clearAllMocks())

describe('createDesignerFlag', () => {
  it('calls db.designerFlag.create with correct data and select, returns id', async () => {
    vi.mocked(db.designerFlag.create).mockResolvedValue({ id: 'flag1' } as never)
    const result = await createDesignerFlag({
      batchId: 'batch1',
      postId: 'post1',
      threadId: 'thread1',
      reviewItemId: 'ri1',
      note: 'fix this',
      createdById: 'user1',
    })
    expect(result).toEqual({ id: 'flag1' })
    expect(vi.mocked(db.designerFlag.create)).toHaveBeenCalledWith({
      data: {
        batchId: 'batch1',
        postId: 'post1',
        threadId: 'thread1',
        reviewItemId: 'ri1',
        note: 'fix this',
        createdById: 'user1',
      },
      select: { id: true },
    })
  })

  it('coerces undefined optional fields to null', async () => {
    vi.mocked(db.designerFlag.create).mockResolvedValue({ id: 'flag2' } as never)
    await createDesignerFlag({
      batchId: 'batch1',
      postId: 'post1',
      createdById: 'user1',
    })
    expect(vi.mocked(db.designerFlag.create)).toHaveBeenCalledWith({
      data: {
        batchId: 'batch1',
        postId: 'post1',
        threadId: null,
        reviewItemId: null,
        note: null,
        createdById: 'user1',
      },
      select: { id: true },
    })
  })
})

describe('updateDesignerFlagNote', () => {
  it('calls db.designerFlag.update with where id and note data', async () => {
    vi.mocked(db.designerFlag.update).mockResolvedValue({} as never)
    await updateDesignerFlagNote('flag1', 'revised note')
    expect(vi.mocked(db.designerFlag.update)).toHaveBeenCalledWith({
      where: { id: 'flag1' },
      data: { note: 'revised note' },
    })
  })

  it('accepts null note (clearing the note)', async () => {
    vi.mocked(db.designerFlag.update).mockResolvedValue({} as never)
    await updateDesignerFlagNote('flag1', null)
    expect(vi.mocked(db.designerFlag.update)).toHaveBeenCalledWith({
      where: { id: 'flag1' },
      data: { note: null },
    })
  })
})

describe('deleteDesignerFlag', () => {
  it('calls db.designerFlag.delete with where id', async () => {
    vi.mocked(db.designerFlag.delete).mockResolvedValue({} as never)
    await deleteDesignerFlag('flag1')
    expect(vi.mocked(db.designerFlag.delete)).toHaveBeenCalledWith({
      where: { id: 'flag1' },
    })
  })
})

describe('setDesignerFlagDone', () => {
  it('sets doneAt to a Date and doneById when done=true', async () => {
    vi.mocked(db.designerFlag.update).mockResolvedValue({} as never)
    const before = Date.now()
    await setDesignerFlagDone('flag1', 'user1', true)
    const after = Date.now()
    const call = vi.mocked(db.designerFlag.update).mock.calls[0][0] as {
      where: { id: string }
      data: { doneAt: Date; doneById: string }
    }
    expect(call.where).toEqual({ id: 'flag1' })
    expect(call.data.doneById).toBe('user1')
    expect(call.data.doneAt).toBeInstanceOf(Date)
    expect(call.data.doneAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(call.data.doneAt.getTime()).toBeLessThanOrEqual(after)
  })

  it('sets doneAt=null and doneById=null when done=false', async () => {
    vi.mocked(db.designerFlag.update).mockResolvedValue({} as never)
    await setDesignerFlagDone('flag1', 'user1', false)
    expect(vi.mocked(db.designerFlag.update)).toHaveBeenCalledWith({
      where: { id: 'flag1' },
      data: { doneAt: null, doneById: null },
    })
  })
})

describe('listDesignerFlagsForBatch', () => {
  it('calls findMany with batchId where and createdAt asc orderBy', async () => {
    vi.mocked(db.designerFlag.findMany).mockResolvedValue([] as never)
    const result = await listDesignerFlagsForBatch('batch1')
    expect(result).toEqual([])
    expect(vi.mocked(db.designerFlag.findMany)).toHaveBeenCalledWith({
      where: { batchId: 'batch1' },
      orderBy: { createdAt: 'asc' },
    })
  })
})

describe('designerFlagCounts', () => {
  it('calls count twice and returns { total, open }', async () => {
    vi.mocked(db.designerFlag.count)
      .mockResolvedValueOnce(7 as never)
      .mockResolvedValueOnce(4 as never)
    const result = await designerFlagCounts('batch1')
    expect(result).toEqual({ total: 7, open: 4 })
    expect(vi.mocked(db.designerFlag.count)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(db.designerFlag.count)).toHaveBeenNthCalledWith(1, {
      where: { batchId: 'batch1' },
    })
    expect(vi.mocked(db.designerFlag.count)).toHaveBeenNthCalledWith(2, {
      where: { batchId: 'batch1', doneAt: null },
    })
  })
})

describe('findDesignerFlagForAuth', () => {
  it('calls findUnique with id and nested auth select', async () => {
    const mockResult = {
      id: 'flag1',
      batchId: 'batch1',
      postId: 'post1',
      post: { clientId: 'client1', client: { organizationId: 'org1' } },
    }
    vi.mocked(db.designerFlag.findUnique).mockResolvedValue(mockResult as never)
    const result = await findDesignerFlagForAuth('flag1')
    expect(result).toEqual(mockResult)
    expect(vi.mocked(db.designerFlag.findUnique)).toHaveBeenCalledWith({
      where: { id: 'flag1' },
      select: {
        id: true,
        batchId: true,
        postId: true,
        post: {
          select: {
            clientId: true,
            client: { select: { organizationId: true } },
          },
        },
      },
    })
  })
})
