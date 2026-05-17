/**
 * Round 2+ auto-carry service for the v2 client review flow.
 *
 * Exposes `startNextRound`, fired when the AM has addressed every item in
 * the current ReviewSession and wants to open round N+1 for the same
 * magic link. The service:
 *   1. Supersedes the current in_progress session.
 *   2. Creates a new ReviewSession at round N+1, still in_progress,
 *      attributed to the same reviewer as the prior round.
 *   3. For every Post in the batch, decides whether the prior round's
 *      approval should carry forward or the post should reset to
 *      not_reviewed:
 *        - carry approval when prior decision was `approved` AND the
 *          post's current version (latest PostVersion) matches the
 *          PostVersion the client reviewed last round.
 *        - reset otherwise. New items inherit the prior
 *          `lastReviewedVersionId` for diff context.
 *   4. Emits a `review_round_started` ActivityEvent.
 *
 * Wired into the AM-facing "Start next round" action in Layer 3 task 3.4.
 * Spec: projects/relay-app/2026-05-17-client-review-session-redesign-plan.md
 * § Task 2.4. Layer 1 lives in `src/server/repositories/reviewSessions.ts`.
 */
import { db } from '@/db/client'
import type { ReviewSession } from '@prisma/client'
import { ActivityKind, EventVisibility } from '@prisma/client'
import {
  markSuperseded,
  startSession,
} from '@/server/repositories/reviewSessions'
import { recordActivity } from '@/server/services/activity'

// ---- Errors ----

export class NoActiveSessionError extends Error {
  constructor(magicLinkId: string) {
    super(`No in_progress ReviewSession exists for magicLink ${magicLinkId}`)
    this.name = 'NoActiveSessionError'
  }
}

export class NoSessionsToCarryFromError extends Error {
  constructor(magicLinkId: string) {
    super(
      `No prior ReviewSession to carry decisions from on magicLink ${magicLinkId}`,
    )
    this.name = 'NoSessionsToCarryFromError'
  }
}

// ---- Public API ----

export interface StartNextRoundInput {
  magicLinkId: string
  /** Clerk user id of the AM triggering the next round. Threaded into the
   * `markSuperseded` audit field and the emitted ActivityEvent. */
  by: string
}

/**
 * Close out the current round on this magic link and open the next one.
 * See file header for full semantics.
 */
export async function startNextRound(
  input: StartNextRoundInput,
): Promise<ReviewSession> {
  // 1. Find the current (not-yet-superseded) session for this magic
  //    link. In the normal flow this is the round-N session the client
  //    just submitted; `markSuperseded` accepts both in_progress and
  //    submitted, so the AM can open the next round whether or not the
  //    client formally submitted. There should be at most one
  //    non-superseded row in the v2 model; we take the most-recently
  //    started just to be safe.
  const current = await db.reviewSession.findFirst({
    where: {
      magicLinkId: input.magicLinkId,
      status: { in: ['in_progress', 'submitted'] },
    },
    orderBy: { startedAt: 'desc' },
    include: { items: true },
  })
  if (!current) throw new NoActiveSessionError(input.magicLinkId)

  // 2. Mark the current session superseded so future startNextRound
  //    calls (and the UI's "active session" query) skip it.
  await markSuperseded({ reviewSessionId: current.id, by: input.by })

  // The session we just superseded IS "the latest submitted-or-superseded"
  // session per spec. Its items + reviewerId drive the carry decision.
  const prior = current
  const priorReviewerId = prior.reviewerId
  if (!priorReviewerId) {
    // A session without a reviewer is a pre-confirm edge case. We
    // can't carry decisions without an attributed reviewer.
    throw new NoSessionsToCarryFromError(input.magicLinkId)
  }

  // Resolve the batch + clientId for activity emit and post lookup.
  const link = await db.magicLink.findUniqueOrThrow({
    where: { id: input.magicLinkId },
    select: { batchId: true, batch: { select: { clientId: true } } },
  })

  // 2. Create the new session at round N+1.
  const nextRound = prior.round + 1
  const newSession = await startSession({
    magicLinkId: input.magicLinkId,
    reviewerId: priorReviewerId,
    round: nextRound,
  })

  // 3. Build a lookup of prior items by postId for the carry decision.
  const priorItemByPost = new Map(
    prior.items.map((item) => [item.postId, item]),
  )

  // Fetch every Post currently on this batch (AM may have added or
  // removed posts between rounds).
  const posts = await db.post.findMany({
    where: { batchId: link.batchId },
    select: { id: true },
  })

  // Look up the current (latest) PostVersion id for every post in one
  // pass. Posts with zero PostVersions get a `null` current version,
  // which lines up with how a brand new Post (never edited) is
  // represented in `lastReviewedVersionId`.
  const currentVersionByPost = await resolveCurrentVersions(
    posts.map((p) => p.id),
  )

  // 4. Materialize one ReviewItem per post on the new session.
  for (const post of posts) {
    const priorItem = priorItemByPost.get(post.id)
    const currentVersionId = currentVersionByPost.get(post.id) ?? null

    if (!priorItem) {
      // Post was added to the batch after the prior round. Treat as
      // new — not reviewed, no prior version context to show.
      await db.reviewItem.create({
        data: {
          reviewSessionId: newSession.id,
          postId: post.id,
          decision: 'not_reviewed',
          updatedSinceLastReview: false,
          lastReviewedVersionId: null,
        },
      })
      continue
    }

    const priorApproved = priorItem.decision === 'approved'
    const unchanged = currentVersionId === priorItem.lastReviewedVersionId

    if (priorApproved && unchanged) {
      // Carry the approval. lastReviewedVersionId stays in lockstep
      // with the current version (which equals what the client signed
      // off on last round).
      await db.reviewItem.create({
        data: {
          reviewSessionId: newSession.id,
          postId: post.id,
          decision: 'approved',
          updatedSinceLastReview: false,
          lastReviewedVersionId: currentVersionId,
          reviewedAt: new Date(),
        },
      })
    } else {
      // Reset. Keep the prior lastReviewedVersionId around so the AM
      // (and downstream diff UI) can show "what changed since the
      // client last reviewed."
      await db.reviewItem.create({
        data: {
          reviewSessionId: newSession.id,
          postId: post.id,
          decision: 'not_reviewed',
          updatedSinceLastReview: true,
          lastReviewedVersionId: priorItem.lastReviewedVersionId ?? null,
        },
      })
    }
  }

  // 5. Emit the round-started ActivityEvent. `recordActivity` swallows
  //    its own errors so this never aborts the round transition.
  await recordActivity({
    clientId: link.batch.clientId,
    actorId: input.by,
    kind: ActivityKind.review_round_started,
    visibility: EventVisibility.internal,
    payload: {
      magicLinkId: input.magicLinkId,
      round: nextRound,
    },
  })

  return newSession
}

/**
 * Returns a Map<postId, latestPostVersionId | undefined> for the given
 * post ids. Posts with zero PostVersion rows are absent from the map.
 */
async function resolveCurrentVersions(
  postIds: string[],
): Promise<Map<string, string>> {
  if (postIds.length === 0) return new Map()
  const versions = await db.postVersion.findMany({
    where: { postId: { in: postIds } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, postId: true },
  })
  // First seen wins thanks to the desc order = latest per post.
  const out = new Map<string, string>()
  for (const v of versions) {
    if (!out.has(v.postId)) out.set(v.postId, v.id)
  }
  return out
}
