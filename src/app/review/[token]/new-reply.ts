import type { HydratedThread } from '@/server/repositories/threads'

/** True when any client-authored thread on the post has an AM reply newer than seenAt (or seenAt is null = never seen). */
export function postHasNewAmReply(
  threads: ReadonlyArray<HydratedThread>,
  seenAt: Date | null,
): boolean {
  return threads.some((t) => {
    if (t.firstComment.author.kind !== 'client') return false // not the client's own thread
    return t.comments.some(
      (c) => c.author.kind === 'am' && (seenAt === null || c.createdAt > seenAt),
    )
  })
}
