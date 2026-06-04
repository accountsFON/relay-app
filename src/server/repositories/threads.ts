import { db } from '@/db/client'
import { ActivityKind } from '@prisma/client'
import { recordActivity } from '@/server/services/activity'
import type { PinLocation, ThreadAuthor, FeedPostProps } from '@/types/preview'

/**
 * Author identity passed in from the action layer. AM = Clerk-authenticated
 * Relay user (resolved to a DB user id). Reviewer = magic link visitor
 * (identified by the hash of their signed token + a snapshot of the name they
 * confirmed at first visit).
 */
export type ThreadActor =
  | { kind: 'am'; userId: string }
  | { kind: 'reviewer'; reviewerToken: string; reviewerName: string }

export class ThreadResolvedError extends Error {
  constructor(threadId: string) {
    super(`Thread ${threadId} is resolved; cannot add comments`)
    this.name = 'ThreadResolvedError'
  }
}

export class ThreadNotFoundError extends Error {
  constructor(threadId: string) {
    super(`Thread ${threadId} not found`)
    this.name = 'ThreadNotFoundError'
  }
}

// ---- Helpers ----

function pinToColumns(pin: PinLocation): {
  imageX: number | null
  imageY: number | null
  captionFrom: number | null
  captionTo: number | null
} {
  if (pin.kind === 'image') {
    return { imageX: pin.x, imageY: pin.y, captionFrom: null, captionTo: null }
  }
  if (pin.kind === 'caption') {
    return { imageX: null, imageY: null, captionFrom: pin.from, captionTo: pin.to }
  }
  return { imageX: null, imageY: null, captionFrom: null, captionTo: null }
}

function rowToPin(row: {
  imageX: number | null
  imageY: number | null
  captionFrom: number | null
  captionTo: number | null
}): PinLocation {
  if (row.imageX !== null && row.imageY !== null) {
    return { kind: 'image', x: row.imageX, y: row.imageY }
  }
  if (row.captionFrom !== null && row.captionTo !== null) {
    return { kind: 'caption', from: row.captionFrom, to: row.captionTo }
  }
  return { kind: 'post' }
}

function authorFieldsForCreate(actor: ThreadActor): {
  createdBy: string | null
  reviewerToken: string | null
} {
  if (actor.kind === 'am') {
    return { createdBy: actor.userId, reviewerToken: null }
  }
  return { createdBy: null, reviewerToken: actor.reviewerToken }
}

function commentAuthorFieldsForCreate(actor: ThreadActor): {
  authorId: string | null
  reviewerToken: string | null
  reviewerName: string | null
} {
  if (actor.kind === 'am') {
    return { authorId: actor.userId, reviewerToken: null, reviewerName: null }
  }
  return {
    authorId: null,
    reviewerToken: actor.reviewerToken,
    reviewerName: actor.reviewerName,
  }
}

/**
 * Hydrate an AM commenter into the ThreadAuthor shape used by the preview
 * components. Falls back to a placeholder if the User row no longer exists
 * (e.g. SetNull cascade on user delete).
 */
function hydrateAmAuthor(user: {
  id: string
  name: string
  avatarUrl: string | null
} | null): ThreadAuthor {
  if (!user) {
    // User row was deleted/SetNull; surface a stable placeholder rather than
    // crashing the preview render.
    return { kind: 'am', userId: '', name: 'Removed user', avatarUrl: null }
  }
  return {
    kind: 'am',
    userId: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl,
  }
}

function hydrateAuthor(comment: {
  authorId: string | null
  reviewerName: string | null
  author: { id: string; name: string; avatarUrl: string | null } | null
}): ThreadAuthor {
  if (comment.authorId) {
    return hydrateAmAuthor(comment.author)
  }
  return { kind: 'client', reviewerName: comment.reviewerName ?? 'Reviewer' }
}

// ---- Public API ----

export interface CreateThreadInput {
  postId: string
  pin: PinLocation
  body: string
  author: ThreadActor
}

export interface CreateThreadResult {
  threadId: string
  postId: string
  status: 'open' | 'resolved'
  pin: PinLocation
  firstComment: { id: string; author: ThreadAuthor; body: string; createdAt: Date }
}

/**
 * Creates a PostThread + the first PostComment in a single transaction.
 * Returns the new thread + first comment with author info hydrated for
 * the ThreadAuthor shape.
 */
export async function createThread(
  input: CreateThreadInput,
): Promise<CreateThreadResult> {
  const { postId, pin, body, author } = input
  const pinCols = pinToColumns(pin)
  const threadAuthorCols = authorFieldsForCreate(author)
  const commentAuthorCols = commentAuthorFieldsForCreate(author)

  const result = await db.$transaction(async (tx) => {
    const thread = await tx.postThread.create({
      data: {
        postId,
        status: 'open',
        ...pinCols,
        ...threadAuthorCols,
      },
    })

    const comment = await tx.postComment.create({
      data: {
        threadId: thread.id,
        body,
        ...commentAuthorCols,
      },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    })

    return {
      threadId: thread.id,
      postId: thread.postId,
      status: thread.status,
      pin: rowToPin(thread),
      firstComment: {
        id: comment.id,
        author: hydrateAuthor(comment),
        body: comment.body,
        createdAt: comment.createdAt,
      },
    }
  })

  // Emit ActivityEvent for the client thread. recordActivity swallows
  // errors internally so an activity write failure cannot abort the
  // thread create. clientId is required for activity rollup; load it
  // from the post (post must exist since the thread was created above).
  // Also pull the client's assignedDesignerId so we can auto-notify the
  // designer when an AM opens the FIRST comment on a thread (by definition
  // this is the first comment, it's the create-thread path). Skip the
  // mention when the AM IS the designer (self-notify) or when no designer
  // is assigned.
  const post = await db.post.findUnique({
    where: { id: postId },
    select: {
      clientId: true,
      client: { select: { assignedDesignerId: true } },
    },
  })
  if (post) {
    const actorUserId = author.kind === 'am' ? author.userId : null
    const designerId = post.client?.assignedDesignerId ?? null
    const mentionedUserIds =
      designerId && designerId !== actorUserId ? [designerId] : []

    await recordActivity({
      clientId: post.clientId,
      postId,
      actorId: actorUserId,
      kind: ActivityKind.post_thread_opened,
      payload: {
        threadId: result.threadId,
        postId,
        pinLocation: pin.kind,
      },
      mentionedUserIds,
    })
  }

  return result
}

export interface AddCommentInput {
  threadId: string
  body: string
  author: ThreadActor
}

export interface AddCommentResult {
  id: string
  threadId: string
  author: ThreadAuthor
  body: string
  createdAt: Date
}

/**
 * Append a comment to an open thread. Throws ThreadResolvedError if the
 * thread is already resolved (resolved threads should be reopened first).
 */
export async function addComment(input: AddCommentInput): Promise<AddCommentResult> {
  const { threadId, body, author } = input
  const commentAuthorCols = commentAuthorFieldsForCreate(author)

  return db.$transaction(async (tx) => {
    const thread = await tx.postThread.findUnique({
      where: { id: threadId },
      select: { id: true, status: true },
    })
    if (!thread) throw new ThreadNotFoundError(threadId)
    if (thread.status === 'resolved') throw new ThreadResolvedError(threadId)

    const comment = await tx.postComment.create({
      data: {
        threadId,
        body,
        ...commentAuthorCols,
      },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    })

    return {
      id: comment.id,
      threadId: comment.threadId,
      author: hydrateAuthor(comment),
      body: comment.body,
      createdAt: comment.createdAt,
    }
  })
}

export interface ResolveThreadInput {
  threadId: string
  resolvedBy: string // DB user id (AM only; enforced at action layer)
  resolvedReason: string | null
}

/**
 * Mark a thread resolved. Idempotent: re-resolving an already-resolved
 * thread is a no-op (does not overwrite the original resolvedBy/resolvedReason).
 */
export async function resolveThread(input: ResolveThreadInput): Promise<void> {
  const { threadId, resolvedBy, resolvedReason } = input

  const thread = await db.postThread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      status: true,
      postId: true,
      post: { select: { clientId: true } },
    },
  })
  if (!thread) throw new ThreadNotFoundError(threadId)
  if (thread.status === 'resolved') return // idempotent

  await db.postThread.update({
    where: { id: threadId },
    data: {
      status: 'resolved',
      resolvedAt: new Date(),
      resolvedBy,
      resolvedReason,
    },
  })

  // Emit ActivityEvent for the client thread. recordActivity swallows
  // errors internally so an activity write failure cannot abort the
  // resolve.
  if (thread.post?.clientId) {
    await recordActivity({
      clientId: thread.post.clientId,
      postId: thread.postId,
      actorId: resolvedBy,
      kind: ActivityKind.post_thread_resolved,
      payload: {
        threadId,
        postId: thread.postId,
        resolvedReason,
      },
    })
  }
}

export interface ReopenThreadInput {
  threadId: string
}

/**
 * Reopen a resolved thread. Clears the resolved* fields. AM-only is
 * enforced at the action layer, not here.
 */
export async function reopenThread(input: ReopenThreadInput): Promise<void> {
  const { threadId } = input
  const thread = await db.postThread.findUnique({
    where: { id: threadId },
    select: { id: true, status: true },
  })
  if (!thread) throw new ThreadNotFoundError(threadId)
  if (thread.status === 'open') return // idempotent

  await db.postThread.update({
    where: { id: threadId },
    data: {
      status: 'open',
      resolvedAt: null,
      resolvedBy: null,
      resolvedReason: null,
    },
  })
}

export type HydratedThread = FeedPostProps['threads'][number]

export interface ListThreadsForPostInput {
  postId: string
  includeResolved?: boolean
}

/**
 * Returns the threads on a post in the FeedPostProps['threads'] shape.
 * Each thread carries its first comment (oldest by createdAt) and a total
 * comment count. Default behavior excludes resolved threads.
 */
export async function listThreadsForPost(
  input: ListThreadsForPostInput,
): Promise<HydratedThread[]> {
  const { postId, includeResolved = false } = input
  const threads = await db.postThread.findMany({
    where: {
      postId,
      ...(includeResolved ? {} : { status: 'open' }),
    },
    orderBy: { createdAt: 'asc' },
    include: {
      comments: {
        orderBy: { createdAt: 'asc' },
        include: {
          author: { select: { id: true, name: true, avatarUrl: true } },
        },
      },
    },
  })

  return threads.map((t) => {
    const first = t.comments[0]
    // Defensive: every thread is created with one comment in createThread.
    // If the row was created by some other path with no comments, surface a
    // placeholder rather than throwing during a render.
    const firstComment = first
      ? {
          author: hydrateAuthor(first),
          body: first.body,
          createdAt: first.createdAt,
        }
      : {
          author: { kind: 'client' as const, reviewerName: 'Unknown' },
          body: '',
          createdAt: t.createdAt,
        }
    return {
      id: t.id,
      status: t.status,
      pin: rowToPin(t),
      firstComment,
      commentCount: t.comments.length,
    }
  })
}

export interface ListThreadsForBatchInput {
  batchId: string
  includeResolved?: boolean
}

/**
 * Returns threads for every post in a batch as a `postId -> threads[]` map.
 * Only used by the batch preview page; per-post lookups should call
 * listThreadsForPost directly.
 */
export async function listThreadsForBatch(
  input: ListThreadsForBatchInput,
): Promise<Map<string, HydratedThread[]>> {
  const { batchId, includeResolved = false } = input
  const threads = await db.postThread.findMany({
    where: {
      post: { batchId },
      ...(includeResolved ? {} : { status: 'open' }),
    },
    orderBy: { createdAt: 'asc' },
    include: {
      comments: {
        orderBy: { createdAt: 'asc' },
        include: {
          author: { select: { id: true, name: true, avatarUrl: true } },
        },
      },
    },
  })

  const result = new Map<string, HydratedThread[]>()
  for (const t of threads) {
    const first = t.comments[0]
    const firstComment = first
      ? {
          author: hydrateAuthor(first),
          body: first.body,
          createdAt: first.createdAt,
        }
      : {
          author: { kind: 'client' as const, reviewerName: 'Unknown' },
          body: '',
          createdAt: t.createdAt,
        }
    const hydrated: HydratedThread = {
      id: t.id,
      status: t.status,
      pin: rowToPin(t),
      firstComment,
      commentCount: t.comments.length,
    }
    const list = result.get(t.postId) ?? []
    list.push(hydrated)
    result.set(t.postId, list)
  }
  return result
}

export interface ListClientThreadsForBatchInput {
  batchId: string
  includeResolved?: boolean
}

/**
 * Returns CLIENT-authored threads (reviewerToken != null) for every post in
 * a batch as a `postId -> threads[]` map. Used by the AM review session
 * detail page to surface the pins a reviewer left. When includeResolved is
 * true, resolved pins are returned too so the page can show addressed pins.
 */
export async function listClientThreadsForBatch(
  input: ListClientThreadsForBatchInput,
): Promise<Map<string, HydratedThread[]>> {
  const { batchId, includeResolved = false } = input
  const threads = await db.postThread.findMany({
    where: {
      post: { batchId },
      reviewerToken: { not: null },
      ...(includeResolved ? {} : { status: 'open' }),
    },
    orderBy: { createdAt: 'asc' },
    include: {
      comments: {
        orderBy: { createdAt: 'asc' },
        include: {
          author: { select: { id: true, name: true, avatarUrl: true } },
        },
      },
    },
  })

  const result = new Map<string, HydratedThread[]>()
  for (const t of threads) {
    const first = t.comments[0]
    const firstComment = first
      ? {
          author: hydrateAuthor(first),
          body: first.body,
          createdAt: first.createdAt,
        }
      : {
          author: { kind: 'client' as const, reviewerName: 'Unknown' },
          body: '',
          createdAt: t.createdAt,
        }
    const hydrated: HydratedThread = {
      id: t.id,
      status: t.status,
      pin: rowToPin(t),
      firstComment,
      commentCount: t.comments.length,
    }
    const list = result.get(t.postId) ?? []
    list.push(hydrated)
    result.set(t.postId, list)
  }
  return result
}

export interface BulkResolveOnPostInput {
  postId: string
  resolvedBy: string
  resolvedReason: string
  /** When true, only resolve CLIENT-left pins (reviewerToken != null). */
  onlyClientPins?: boolean
}

/**
 * Flip every open thread on a post to resolved with the same reason.
 * Returns the count flipped (zero if no open threads). Used by the AM
 * "bulk-resolve on post" override and by the review session detail page
 * (with onlyClientPins to leave AM-authored pins alone).
 */
export async function bulkResolveOnPost(
  input: BulkResolveOnPostInput,
): Promise<number> {
  const { postId, resolvedBy, resolvedReason, onlyClientPins = false } = input
  const result = await db.postThread.updateMany({
    where: {
      postId,
      status: 'open',
      ...(onlyClientPins ? { reviewerToken: { not: null } } : {}),
    },
    data: {
      status: 'resolved',
      resolvedAt: new Date(),
      resolvedBy,
      resolvedReason,
    },
  })
  return result.count
}
