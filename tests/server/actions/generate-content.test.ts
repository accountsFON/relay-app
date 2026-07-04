import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/middleware/permissions', () => ({
  requireGenerationTrigger: vi.fn(),
}))

vi.mock('@/server/repositories/clients', () => ({
  findClientForUser: vi.fn(),
}))

vi.mock('@/server/repositories/contentRuns', () => ({
  findMatchingBatchForClientMonth: vi.fn(),
}))

vi.mock('@/app/(app)/clients/[id]/generate/actions', () => ({
  triggerGeneration: vi.fn(),
}))

import { requireGenerationTrigger } from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import { findMatchingBatchForClientMonth } from '@/server/repositories/contentRuns'
import { triggerGeneration } from '@/app/(app)/clients/[id]/generate/actions'
import { generateContentAction } from '@/server/actions/generate-content'

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

const CLIENT_ID = 'client_1'
const TARGET_MONTH = '2026-05'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireGenerationTrigger).mockResolvedValue(mockCtx as never)
  // Default: onboarded client so existing tests continue to reach the batch/fire logic
  vi.mocked(findClientForUser).mockResolvedValue({
    id: CLIENT_ID,
    onboardingCompletedAt: new Date('2026-01-01'),
  } as never)
})

// ---------------------------------------------------------------------------
// Auth / client lookup
// ---------------------------------------------------------------------------

describe('generateContentAction — auth & client lookup', () => {
  it('gates on generation.trigger (not client.edit) before any work', async () => {
    await generateContentAction({
      kind: 'probe',
      clientId: CLIENT_ID,
      targetMonth: TARGET_MONTH,
    })
    expect(requireGenerationTrigger).toHaveBeenCalled()
  })

  it('returns error when client not found for user', async () => {
    vi.mocked(findClientForUser).mockResolvedValueOnce(null)
    const result = await generateContentAction({
      kind: 'probe',
      clientId: 'nonexistent-client-id',
      targetMonth: '2026-05',
    })
    expect(result).toEqual({ kind: 'error', message: 'Client not found' })
  })
})

// ---------------------------------------------------------------------------
// Probe phase
// ---------------------------------------------------------------------------

describe('generateContentAction — probe phase', () => {
  it('returns no_match when no batch exists for client+month', async () => {
    vi.mocked(findMatchingBatchForClientMonth).mockResolvedValue(null)

    const result = await generateContentAction({
      kind: 'probe',
      clientId: CLIENT_ID,
      targetMonth: TARGET_MONTH,
    })

    expect(result).toEqual({ kind: 'no_match' })
    expect(vi.mocked(findMatchingBatchForClientMonth)).toHaveBeenCalledWith(CLIENT_ID, TARGET_MONTH)
  })

  it('returns empty_batch when matching batch has 0 posts', async () => {
    vi.mocked(findMatchingBatchForClientMonth).mockResolvedValue({
      id: 'batch_empty',
      label: 'May 2026',
      postCount: 0,
    })

    const result = await generateContentAction({
      kind: 'probe',
      clientId: CLIENT_ID,
      targetMonth: TARGET_MONTH,
    })

    expect(result).toEqual({ kind: 'empty_batch', batchId: 'batch_empty', label: 'May 2026' })
  })

  it('returns needs_confirm with postCount when matching batch has N≥1 posts', async () => {
    vi.mocked(findMatchingBatchForClientMonth).mockResolvedValue({
      id: 'batch_populated',
      label: 'May 2026',
      postCount: 12,
    })

    const result = await generateContentAction({
      kind: 'probe',
      clientId: CLIENT_ID,
      targetMonth: TARGET_MONTH,
    })

    expect(result).toEqual({
      kind: 'needs_confirm',
      batchId: 'batch_populated',
      label: 'May 2026',
      postCount: 12,
    })
  })

  it('returns no_match when only archived batches exist (repository excludes them)', async () => {
    // findMatchingBatchForClientMonth already excludes archived (deletedAt: null).
    // This test verifies that the action trusts the repository's null return.
    vi.mocked(findMatchingBatchForClientMonth).mockResolvedValue(null)

    const result = await generateContentAction({
      kind: 'probe',
      clientId: CLIENT_ID,
      targetMonth: TARGET_MONTH,
    })

    expect(result).toEqual({ kind: 'no_match' })
  })
})

// ---------------------------------------------------------------------------
// Fire phase
// ---------------------------------------------------------------------------

describe('generateContentAction — fire phase', () => {
  it('targetBatchId=null on no_match path → ContentRun gets targetBatchId=null, returns fired', async () => {
    vi.mocked(findMatchingBatchForClientMonth).mockResolvedValue(null)
    vi.mocked(triggerGeneration).mockResolvedValue({ contentRunId: 'run_new_1' })

    const result = await generateContentAction({
      kind: 'fire',
      clientId: CLIENT_ID,
      targetMonth: TARGET_MONTH,
      targetBatchId: null,
      recrawl: false,
    })

    expect(result).toEqual({ kind: 'fired', runId: 'run_new_1' })
    // targetBatchId=null path, no match → effectiveTargetBatchId=null
    expect(vi.mocked(triggerGeneration)).toHaveBeenCalledWith(
      CLIENT_ID,
      TARGET_MONTH,
      false,
      { targetBatchId: null },
    )
  })

  it('targetBatchId=null on empty_batch path → server auto-sets effectiveTargetBatchId to empty batch id', async () => {
    vi.mocked(findMatchingBatchForClientMonth).mockResolvedValue({
      id: 'batch_empty',
      label: 'May 2026',
      postCount: 0,
    })
    vi.mocked(triggerGeneration).mockResolvedValue({ contentRunId: 'run_new_2' })

    const result = await generateContentAction({
      kind: 'fire',
      clientId: CLIENT_ID,
      targetMonth: TARGET_MONTH,
      targetBatchId: null,
      recrawl: false,
    })

    expect(result).toEqual({ kind: 'fired', runId: 'run_new_2' })
    // Empty batch exists → effectiveTargetBatchId auto-set to 'batch_empty'
    expect(vi.mocked(triggerGeneration)).toHaveBeenCalledWith(
      CLIENT_ID,
      TARGET_MONTH,
      false,
      { targetBatchId: 'batch_empty' },
    )
  })

  it('valid targetBatchId (user confirmed Replace) → fires with batch id, returns fired', async () => {
    vi.mocked(findMatchingBatchForClientMonth).mockResolvedValue({
      id: 'batch_confirmed',
      label: 'May 2026',
      postCount: 7,
    })
    vi.mocked(triggerGeneration).mockResolvedValue({ contentRunId: 'run_new_3' })

    const result = await generateContentAction({
      kind: 'fire',
      clientId: CLIENT_ID,
      targetMonth: TARGET_MONTH,
      targetBatchId: 'batch_confirmed',
      recrawl: false,
    })

    expect(result).toEqual({ kind: 'fired', runId: 'run_new_3' })
    expect(vi.mocked(triggerGeneration)).toHaveBeenCalledWith(
      CLIENT_ID,
      TARGET_MONTH,
      false,
      { targetBatchId: 'batch_confirmed' },
    )
    // triggerGeneration is responsible for writing the ContentRun row —
    // we trust the mock, verifying the arg is sufficient.
  })

  it('drift: targetBatchId no longer matches current state → returns drift with current state', async () => {
    // Caller confirmed against 'batch_stale', but current match is 'batch_new'
    vi.mocked(findMatchingBatchForClientMonth).mockResolvedValue({
      id: 'batch_new',
      label: 'May 2026',
      postCount: 3,
    })

    const result = await generateContentAction({
      kind: 'fire',
      clientId: CLIENT_ID,
      targetMonth: TARGET_MONTH,
      targetBatchId: 'batch_stale',
      recrawl: false,
    })

    expect(result).toEqual({
      kind: 'drift',
      current: { batchId: 'batch_new', label: 'May 2026', postCount: 3 },
    })
    expect(vi.mocked(triggerGeneration)).not.toHaveBeenCalled()
  })

  it('drift: caller passed targetBatchId=null but a populated batch appeared between probe and fire', async () => {
    // At probe: no match. Between probe and fire: a populated batch appeared.
    vi.mocked(findMatchingBatchForClientMonth).mockResolvedValue({
      id: 'batch_appeared',
      label: 'May 2026',
      postCount: 5,
    })

    const result = await generateContentAction({
      kind: 'fire',
      clientId: CLIENT_ID,
      targetMonth: TARGET_MONTH,
      targetBatchId: null,
      recrawl: false,
    })

    expect(result).toEqual({
      kind: 'drift',
      current: { batchId: 'batch_appeared', label: 'May 2026', postCount: 5 },
    })
    expect(vi.mocked(triggerGeneration)).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Onboarding guard
// ---------------------------------------------------------------------------

describe('generateContentAction — onboarding guard', () => {
  it('probe: returns error and does not call triggerGeneration when onboardingCompletedAt is null', async () => {
    vi.mocked(findClientForUser).mockResolvedValue({
      id: CLIENT_ID,
      onboardingCompletedAt: null,
    } as never)

    const result = await generateContentAction({
      kind: 'probe',
      clientId: CLIENT_ID,
      targetMonth: TARGET_MONTH,
    })

    expect(result).toEqual({ kind: 'error', message: expect.stringContaining('onboarding') })
    expect(vi.mocked(triggerGeneration)).not.toHaveBeenCalled()
  })

  it('fire: returns error and does not call triggerGeneration when onboardingCompletedAt is null', async () => {
    vi.mocked(findClientForUser).mockResolvedValue({
      id: CLIENT_ID,
      onboardingCompletedAt: null,
    } as never)

    const result = await generateContentAction({
      kind: 'fire',
      clientId: CLIENT_ID,
      targetMonth: TARGET_MONTH,
      targetBatchId: null,
      recrawl: false,
    })

    expect(result).toEqual({ kind: 'error', message: expect.stringContaining('onboarding') })
    expect(vi.mocked(triggerGeneration)).not.toHaveBeenCalled()
  })
})
