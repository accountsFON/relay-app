'use server'

import { requireClientEditor } from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import { findMatchingBatchForClientMonth } from '@/server/repositories/contentRuns'
import { triggerGeneration } from '@/app/(app)/clients/[id]/generate/actions'

export type GenerateContentInput =
  | {
      kind: 'probe'
      clientId: string
      targetMonth: string // 'YYYY-MM'
    }
  | {
      kind: 'fire'
      clientId: string
      targetMonth: string
      targetBatchId: string | null
      recrawl: boolean
    }

export type GenerateContentResult =
  | { kind: 'no_match' }
  | { kind: 'empty_batch'; batchId: string; label: string }
  | { kind: 'needs_confirm'; batchId: string; label: string; postCount: number }
  | { kind: 'fired'; runId: string }
  | { kind: 'drift'; current: { batchId: string; label: string; postCount: number } | null }
  | { kind: 'error'; message: string }

export async function generateContentAction(
  input: GenerateContentInput,
): Promise<GenerateContentResult> {
  const ctx = await requireClientEditor()
  const client = await findClientForUser(ctx, input.clientId)
  if (!client) return { kind: 'error', message: 'Client not found' }

  // Re-validate the match on every call. This is the single source of truth.
  const match = await findMatchingBatchForClientMonth(input.clientId, input.targetMonth)

  if (input.kind === 'probe') {
    if (!match) return { kind: 'no_match' }
    if (match.postCount === 0) {
      return { kind: 'empty_batch', batchId: match.id, label: match.label }
    }
    return {
      kind: 'needs_confirm',
      batchId: match.id,
      label: match.label,
      postCount: match.postCount,
    }
  }

  // Fire phase.
  // Drift detection: compare caller's targetBatchId against current state.
  if (input.targetBatchId !== null) {
    // Caller confirmed Replace against a specific batch.
    if (!match || match.id !== input.targetBatchId) {
      return {
        kind: 'drift',
        current: match
          ? { batchId: match.id, label: match.label, postCount: match.postCount }
          : null,
      }
    }
  } else {
    // Caller passed null (auto-fire path: no_match or empty_batch).
    // If a populated batch appeared between probe and fire, drift.
    if (match && match.postCount > 0) {
      return {
        kind: 'drift',
        current: { batchId: match.id, label: match.label, postCount: match.postCount },
      }
    }
  }

  // Determine effective targetBatchId for the ContentRun row.
  // - Replace path: caller passed targetBatchId, use it.
  // - Empty-batch path: caller passed null, but match exists with 0 posts. Auto-set.
  // - No-match path: both null, ContentRun gets targetBatchId=null.
  const effectiveTargetBatchId =
    input.targetBatchId ?? (match && match.postCount === 0 ? match.id : null)

  try {
    const { contentRunId } = await triggerGeneration(
      input.clientId,
      input.targetMonth,
      input.recrawl,
      { targetBatchId: effectiveTargetBatchId },
    )
    return { kind: 'fired', runId: contentRunId }
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : 'Failed to start generation' }
  }
}
