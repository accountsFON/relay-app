import type { HydratedThread } from '@/server/repositories/threads'

/**
 * A designer flag on a piece of client feedback (a pin thread or a review
 * item note). Built by the server page from the batch's DesignerFlag rows.
 */
export type DesignerFlagVM = {
  id: string
  threadId: string | null
  reviewItemId: string | null
  note: string | null
  done: boolean
}

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
  /** The client's general Notes for this post (ReviewItem.comment), if any.
   *  The opener the AM replies to when promoting Notes into a post-level thread. */
  comment: string | null
  /** The ReviewItem id, when one exists (needed for accept/reject/mark). */
  reviewItemId: string | null
  /** True when the item is handled (accepted/addressed) and no open pins remain. */
  addressed: boolean
  /** True when the AM accepted the client's caption suggestion
   *  (ReviewItem.acceptedAsPostVersionId is set). Drives the greyed success
   *  state on the caption-suggestion block. */
  captionAccepted: boolean
  /** True when the AM has resolved the client's general note
   *  (ReviewItem.noteResolvedAt is set). */
  noteResolved: boolean
  /** All client threads (pins/comments) on this post, open + resolved. */
  threads: ReadonlyArray<HydratedThread>
  /** Designer flags raised on this post's feedback (pin threads or notes). */
  flags: ReadonlyArray<DesignerFlagVM>
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
  resolveNote: (postId: string, reviewItemId: string) => Promise<void>
  unresolveNote: (postId: string, reviewItemId: string) => Promise<void>
  /** AM-only: reply to a post's general (non-pin) feedback. Promotes the
   *  client's Notes into a reviewer post-level thread and appends the reply. */
  replyToFeedback: (
    reviewItemId: string,
    body: string,
    image?: { url: string; width?: number; height?: number },
  ) => Promise<void>
  startNextRound: () => Promise<void>
  /** Flag a piece of client feedback (a pin thread or a review-item note) for
   *  the designer. Exactly one of ref.threadId / ref.reviewItemId is provided. */
  flagForDesigner: (
    postId: string,
    ref: { threadId?: string; reviewItemId?: string },
    note?: string,
  ) => Promise<void>
  unflagForDesigner: (flagId: string) => Promise<void>
  sendToDesigner: () => Promise<void>
  setFlagDone: (flagId: string) => Promise<void>
  unsetFlagDone: (flagId: string) => Promise<void>
  markRevisionsDone: () => Promise<void>
}
