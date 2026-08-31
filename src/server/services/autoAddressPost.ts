/**
 * Auto-address roll-up, server side.
 *
 * When the last outstanding piece of client feedback on a post is resolved, the
 * post's ReviewItem is stamped addressed so the AM does not have to click "Mark
 * addressed" as a second, purely clerical step.
 *
 * Why this lives behind the WRITE rather than in a click handler (Julio,
 * 2026-08-31): the roll-up used to exist only inside the review rail's
 * `resolveThenMaybeAddress`, so it fired only when someone resolved through
 * that one screen. The designer resolves the very same client threads from the
 * batch preview page, which calls `resolveThreadAction` directly and never
 * touched `addressedAt`. The designer reported "I marked everything resolved",
 * the threads genuinely were resolved, and every "Mark addressed" button was
 * still sitting unpressed. Putting the roll-up here makes it fire from any
 * surface, now and for any surface added later.
 *
 * Best effort by contract: this NEVER throws. Resolving a thread must succeed
 * even if the roll-up cannot run.
 */
import { db } from '@/db/client'

export type AutoAddressResult =
  /** Stamped addressed. */
  | 'addressed'
  /** Something on the post is still outstanding. */
  | 'not-ready'
  /** No review item, or one that was never a change request. Nothing to address. */
  | 'no-item'
  /** Already addressed; left alone. */
  | 'already'
  /** An unexpected fault, swallowed so the resolve still succeeds. */
  | 'error'

/**
 * Mirrors `markPostAddressedAction`: only a change request or a caption edit
 * can be "addressed". An approved post was never outstanding.
 */
const ADDRESSABLE = new Set(['changes_requested', 'caption_edited'])

export async function maybeAutoAddressPost(
  postId: string,
  actorUserId: string,
): Promise<AutoAddressResult> {
  try {
    // The most recent round's item is the one the AM is working.
    const item = await db.reviewItem.findFirst({
      where: { postId },
      orderBy: { reviewSession: { startedAt: 'desc' } },
      select: {
        id: true,
        decision: true,
        comment: true,
        noteResolvedAt: true,
        addressedAt: true,
        acceptedAsPostVersionId: true,
      },
    })
    if (!item || !ADDRESSABLE.has(item.decision)) return 'no-item'
    if (item.addressedAt != null) return 'already'

    // CLIENT threads only (`reviewerToken` set). An AM's own internal pin is
    // not client feedback and must not hold the post open, which is the same
    // rule `bulkResolveOnPost({ onlyClientPins: true })` follows.
    const threads = await db.postThread.findMany({
      where: { postId, reviewerToken: { not: null } },
      select: { id: true, status: true, imageX: true, imageY: true, captionFrom: true, captionTo: true },
    })
    if (threads.some((t) => t.status !== 'resolved')) return 'not-ready'

    // The note counts as its own outstanding item ONLY while it stands alone.
    // Once a post-level thread exists (which is what a general note becomes the
    // moment anyone replies to it) the thread carries it, and no separate note
    // tick is offered anywhere in the UI. Waiting for one would hang forever;
    // that was the 2026-08-31 bug on the client side of this same rule.
    const hasPostLevelThread = threads.some(
      (t) => t.imageX == null && t.imageY == null && t.captionFrom == null && t.captionTo == null,
    )
    const noteOutstanding =
      Boolean(item.comment?.trim()) && !hasPostLevelThread && item.noteResolvedAt == null
    if (noteOutstanding) return 'not-ready'

    // A suggested caption is only handled once the AM accepts it.
    if (item.decision === 'caption_edited' && !item.acceptedAsPostVersionId) return 'not-ready'

    const now = new Date()
    await db.reviewItem.update({
      where: { id: item.id },
      data: {
        addressedAt: now,
        addressedBy: actorUserId,
        // Keep both halves in agreement, exactly as markPostAddressedAction does.
        noteResolvedAt: item.noteResolvedAt ?? now,
        noteResolvedBy: actorUserId,
      },
    })
    return 'addressed'
  } catch (err) {
    console.error('[auto-address] roll-up failed', {
      postId,
      err: err instanceof Error ? err.message : String(err),
    })
    return 'error'
  }
}
