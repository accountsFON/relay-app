/**
 * STUB — Task 1.4 (ReviewSession repository) is in flight in parallel.
 *
 * This file declares the surface that Task 1.5 (`saveItemDraft` service)
 * codes against so TypeScript builds clean during dev. The Task 1.4 PR
 * will replace this file with the real implementation at merge time.
 * The driver resolves the merge conflict in favor of Task 1.4's version.
 *
 * The exported signatures here match Task 1.4's plan-doc spec
 * (`projects/relay-app/2026-05-17-client-review-session-redesign-plan.md`
 * § Task 1.4). If 1.4 lands with a different shape, this file's contract
 * tests in tests/server/services/reviewDraft.test.ts catch the drift.
 *
 * The bodies throw at runtime so any accidental prod call surfaces
 * loudly. The reviewDraft service test mocks this whole module, so the
 * stub never executes in test runs.
 */
import type {
  ReviewDecisionType,
  ReviewItemHydrated,
  ReviewSessionStatusType,
  ReviewSessionSummary,
  ReviewSessionWithItems,
} from '@/types/review-session'

export interface ReviewSessionRow {
  id: string
  magicLinkId: string
  reviewerId: string | null
  status: ReviewSessionStatusType
  round: number
  startedAt: Date
  submittedAt: Date | null
  submittedSummary: ReviewSessionSummary | null
}

export interface StartSessionInput {
  magicLinkId: string
  reviewerId: string | null
  /** Optional explicit round number. Defaults to 1 for the first session on a link. */
  round?: number
}

export interface FindActiveSessionInput {
  magicLinkId: string
  reviewerId: string
}

export interface SaveDraftItemInput {
  reviewSessionId: string
  postId: string
  decision?: ReviewDecisionType
  comment?: string | null
  suggestedCaption?: string | null
}

export interface SubmitSessionInput {
  reviewSessionId: string
  summary: ReviewSessionSummary
}

function stubError(name: string): Error {
  return new Error(
    `reviewSessions.${name} is not implemented — Task 1.4 stub. ` +
      `If you are seeing this in prod, Task 1.4 PR did not merge.`,
  )
}

export async function startSession(
  _input: StartSessionInput,
): Promise<ReviewSessionRow> {
  throw stubError('startSession')
}

export async function findActiveSession(
  _input: FindActiveSessionInput,
): Promise<ReviewSessionRow | null> {
  throw stubError('findActiveSession')
}

export async function saveDraftItem(
  _input: SaveDraftItemInput,
): Promise<ReviewItemHydrated> {
  throw stubError('saveDraftItem')
}

export async function submitSession(
  _input: SubmitSessionInput,
): Promise<ReviewSessionRow> {
  throw stubError('submitSession')
}

export async function markSuperseded(_id: string): Promise<void> {
  throw stubError('markSuperseded')
}

export async function listSessionsForBatch(
  _batchId: string,
): Promise<ReviewSessionRow[]> {
  throw stubError('listSessionsForBatch')
}

export async function findSessionWithItems(
  _id: string,
): Promise<ReviewSessionWithItems | null> {
  throw stubError('findSessionWithItems')
}
