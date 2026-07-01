import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/middleware/permissions', () => ({
  requireClientEditor: vi.fn(),
}))
vi.mock('@/server/repositories/clients', () => ({
  findClientForUser: vi.fn(),
}))
vi.mock('@/server/repositories/contentRuns', () => ({
  findExistingRun: vi.fn(),
  createContentRun: vi.fn(),
  archiveContentRun: vi.fn(),
  findContentRunForOrg: vi.fn(),
  findMatchingBatchForClientMonth: vi.fn(),
}))
vi.mock('@/db/client', () => ({
  db: { contentRun: { update: vi.fn() } },
}))
const triggerMock = vi.fn()
vi.mock('@/server/jobs/generateContent', () => ({
  generateContentTask: { trigger: triggerMock },
}))

import { requireClientEditor } from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import { findExistingRun, createContentRun } from '@/server/repositories/contentRuns'
import { db } from '@/db/client'
import { triggerGeneration } from '@/app/(app)/clients/[id]/generate/actions'

describe('triggerGeneration -- persists the trigger handle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireClientEditor).mockResolvedValue({ userDbId: 'u1' } as never)
    vi.mocked(findClientForUser).mockResolvedValue({ id: 'c1', autoCrawl: 'never', crawledData: null, onboardingCompletedAt: new Date('2026-01-01') } as never)
    vi.mocked(findExistingRun).mockResolvedValue(null as never)
    vi.mocked(createContentRun).mockResolvedValue({ id: 'run-1' } as never)
  })

  it('writes the returned handle id to triggerJobId', async () => {
    triggerMock.mockResolvedValue({ id: 'run_abc123' })

    const res = await triggerGeneration('c1', '2026-07', false)

    expect(res).toEqual({ contentRunId: 'run-1' })
    expect(db.contentRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: { triggerJobId: 'run_abc123' },
    })
  })
})
