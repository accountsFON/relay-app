/**
 * Magic link first-visit emit. When a magic link is opened for the very
 * first time, this helper claims the slot atomically and records a
 * `magic_link_visited` ActivityEvent with a Mention on the assigned AM.
 *
 * Race safety: `MagicLink.lastVisitedAt` doubles as the first-visit
 * sentinel. `updateMany` with `where: { lastVisitedAt: null }` is
 * compare-and-swap at the DB level, only one of N concurrent visits
 * "wins" the count === 1 path, regardless of interleaving. Subsequent
 * visits bump lastVisitedAt for the AM's "Last visited X" UI without
 * re-emitting.
 *
 * Not a 'use server' module by design: it's only called from the
 * `/review/[token]` server component, never from a client RPC, so the
 * action surface stays minimal.
 *
 * Background context: deferred from Phase 1 T14 because the schema had
 * no first-visit signal. The CAS approach avoids a new column.
 */
import { db } from '@/db/client'
import {
  recordActivity,
  ActivityKind,
  EventVisibility,
} from '@/server/services/activity'

export interface MarkMagicLinkVisitedInput {
  magicLinkId: string
  batchId: string
  clientId: string
  assignedAmUserId: string | null
  defaultReviewerName: string | null
}

export interface MarkMagicLinkVisitedResult {
  isFirstVisit: boolean
  emitted: boolean
}

export async function markMagicLinkVisited(
  input: MarkMagicLinkVisitedInput,
): Promise<MarkMagicLinkVisitedResult> {
  const now = new Date()

  // Atomic compare-and-swap: claim the first-visit slot only if
  // lastVisitedAt is still null. Exactly one caller wins under
  // concurrent visits.
  const cas = await db.magicLink.updateMany({
    where: { id: input.magicLinkId, lastVisitedAt: null },
    data: { lastVisitedAt: now },
  })
  const isFirstVisit = cas.count === 1

  if (!isFirstVisit) {
    // Subsequent visit: still bump lastVisitedAt so the AM's "Last
    // visited X" indicator stays accurate. Best-effort; do not block
    // the page render on a stale visit-timestamp write.
    void db.magicLink
      .update({
        where: { id: input.magicLinkId },
        data: { lastVisitedAt: now },
      })
      .catch(() => null)
    return { isFirstVisit: false, emitted: false }
  }

  // First visit: emit the ActivityEvent + Mention the AM.
  const event = await recordActivity({
    clientId: input.clientId,
    actorId: null,
    kind: ActivityKind.magic_link_visited,
    visibility: EventVisibility.internal,
    payload: {
      magicLinkId: input.magicLinkId,
      batchId: input.batchId,
      reviewerName: input.defaultReviewerName ?? 'A reviewer',
      isFirstVisit: true,
    },
    mentionedUserIds: input.assignedAmUserId ? [input.assignedAmUserId] : [],
  })

  return { isFirstVisit: true, emitted: event !== null }
}
