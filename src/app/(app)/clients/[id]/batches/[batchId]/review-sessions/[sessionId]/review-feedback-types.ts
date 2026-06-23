import type { HydratedThread } from '@/server/repositories/threads'

/**
 * Per-post view model for the AM client-feedback markup layout. Built by the
 * server page from the review-session items + client threads + posts, then
 * handed to the client shell. One entry per post in canonical batch order.
 */
export type FeedbackPostVM = {
  postId: string
  postNumber: number
  caption: string
  mediaUrls: string[]
  /** ISO date string; the rail formats for display. */
  postDate: string
  /** The client's verdict on this post. 'none' = no ReviewItem (pins only). */
  verdict: 'approved' | 'changes_requested' | 'caption_edited' | 'none'
  /** Set when the client edited the caption (verdict === 'caption_edited'). */
  suggestedCaption: string | null
  /** The ReviewItem id, when one exists (needed for accept/reject/mark). */
  reviewItemId: string | null
  /** True when the item is handled (accepted/addressed) and no open pins remain. */
  addressed: boolean
  /** All client threads (pins/comments) on this post, open + resolved. */
  threads: ReadonlyArray<HydratedThread>
}

/**
 * Parameterized server actions passed from the server page into the client
 * shell. These wrap the existing review-session server actions + revalidate;
 * the shell/rail bind the right ids per row.
 */
export type FeedbackActions = {
  comment: (
    threadId: string,
    body: string,
    image?: { url: string; width?: number; height?: number },
  ) => Promise<void>
  resolve: (threadId: string) => Promise<void>
  useAsPostImage: (postId: string, commentId: string) => Promise<void>
  acceptCaption: (reviewItemId: string) => Promise<void>
  rejectCaption: (reviewItemId: string) => Promise<void>
  markAddressed: (postId: string, reviewItemId: string | null) => Promise<void>
  unmarkAddressed: (postId: string, reviewItemId: string | null) => Promise<void>
  startNextRound: () => Promise<void>
}
