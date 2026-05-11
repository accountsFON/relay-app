import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/client', () => ({
  db: {
    post: {
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
    },
    batch: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@/server/middleware/permissions', () => ({
  requireClientEditor: vi.fn(),
}))

vi.mock('@/server/repositories/contentRuns', () => ({
  findContentRun: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { db } from '@/db/client'
import { requireClientEditor } from '@/server/middleware/permissions'
import { findContentRun } from '@/server/repositories/contentRuns'
import {
  finalizePostGenerationAction,
  findMatchingBatchForRunAction,
} from '@/server/actions/finalize-post-generation'

const mockCtx = {
  userId: 'user_clerk_123',
  orgId: 'org_1',
  role: 'account_manager' as const,
  plan: 'agency' as const,
  organizationDbId: 'cuid_org_1',
  userDbId: 'cuid_user_1',
  platformOwner: false,
  linkedClientId: null,
  permissionOverrides: null,
  roleDefaults: {},
}

const mockRun = {
  id: 'run_1',
  clientId: 'client_1',
  targetMonth: '2026-05',
  status: 'complete',
  posts: [{ id: 'post_1' }, { id: 'post_2' }, { id: 'post_3' }],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireClientEditor).mockResolvedValue(mockCtx)
  vi.mocked(findContentRun).mockResolvedValue(mockRun as never)
})

describe('finalizePostGenerationAction', () => {
  it("'add' attaches new posts to existing batch and advances sub-state", async () => {
    const result = await finalizePostGenerationAction({
      choice: 'add',
      runId: 'run_1',
      batchId: 'batch_existing',
    })

    expect(result).toEqual({ batchId: 'batch_existing' })

    // Posts attached to the existing batch
    expect(db.post.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['post_1', 'post_2', 'post_3'] } },
      data: { batchId: 'batch_existing' },
    })

    // Batch sub-state advanced to drafted
    expect(db.batch.update).toHaveBeenCalledWith({
      where: { id: 'batch_existing' },
      data: { currentSubState: 'drafted' },
    })

    // No posts deleted
    expect(db.post.deleteMany).not.toHaveBeenCalled()
  })

  it("'replace' deletes existing batch posts then attaches new ones", async () => {
    const result = await finalizePostGenerationAction({
      choice: 'replace',
      runId: 'run_1',
      batchId: 'batch_existing',
    })

    expect(result).toEqual({ batchId: 'batch_existing' })

    // Existing posts in batch deleted (excluding the new ones, which have no batchId yet)
    expect(db.post.deleteMany).toHaveBeenCalledWith({
      where: {
        batchId: 'batch_existing',
        id: { notIn: ['post_1', 'post_2', 'post_3'] },
      },
    })

    // New posts attached to the batch
    expect(db.post.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['post_1', 'post_2', 'post_3'] } },
      data: { batchId: 'batch_existing' },
    })

    // Batch sub-state advanced to drafted
    expect(db.batch.update).toHaveBeenCalledWith({
      where: { id: 'batch_existing' },
      data: { currentSubState: 'drafted' },
    })
  })

  it("'new' creates a new batch with custom label and attaches new posts", async () => {
    vi.mocked(db.batch.findFirst).mockResolvedValue({
      currentHolder: 'user_existing',
      currentRole: 'designer',
    } as never)

    vi.mocked(db.batch.create).mockResolvedValue({
      id: 'batch_new',
    } as never)

    const result = await finalizePostGenerationAction({
      choice: 'new',
      runId: 'run_1',
      label: 'May 2026 (rerun)',
    })

    expect(result).toEqual({ batchId: 'batch_new' })

    // Batch created with the custom label and holder from the existing batch
    expect(db.batch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId: 'client_1',
        label: 'May 2026 (rerun)',
        currentStep: 'copy',
        currentSubState: 'drafted',
        currentHolder: 'user_existing',
        currentRole: 'designer',
      }),
    })

    // New posts attached to the new batch
    expect(db.post.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['post_1', 'post_2', 'post_3'] } },
      data: { batchId: 'batch_new' },
    })

    // No sub-state update call for 'new' (it was already set 'drafted' on create)
    expect(db.batch.update).not.toHaveBeenCalled()
  })
})

describe('findMatchingBatchForRunAction', () => {
  it('returns null when no batch matches client + targetMonth', async () => {
    vi.mocked(db.batch.findFirst).mockResolvedValue(null)

    const result = await findMatchingBatchForRunAction('run_1')

    expect(result).toBeNull()
    expect(db.batch.findFirst).toHaveBeenCalledWith({
      where: { clientId: 'client_1', label: '2026-05' },
      select: {
        id: true,
        label: true,
        _count: { select: { posts: true } },
      },
    })
  })

  it('returns batch info when client + targetMonth match', async () => {
    vi.mocked(db.batch.findFirst).mockResolvedValue({
      id: 'batch_existing',
      label: '2026-05',
      _count: { posts: 12 },
    } as never)

    const result = await findMatchingBatchForRunAction('run_1')

    expect(result).toEqual({
      batchId: 'batch_existing',
      label: '2026-05',
      postCount: 12,
    })
  })
})
