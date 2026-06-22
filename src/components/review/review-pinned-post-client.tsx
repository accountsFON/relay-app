'use client'

/**
 * Thin client wrapper around ReviewPinnedPost that wires the AM's
 * comment-image upload helper. The server page passes `userDbId` as a
 * serializable prop; this client component constructs the upload callback
 * and forwards everything else straight through to ReviewPinnedPost.
 *
 * Kept intentionally minimal: no extra state, no logic — just the prop
 * bridge that a pure server component cannot do (it can't pass a
 * `(file: File) => Promise<...>` function as a prop).
 */
import { useCallback } from 'react'
import { uploadCommentImage } from '@/lib/upload-comment-image'
import {
  ReviewPinnedPost,
  type ReviewPinnedPostProps,
} from '@/components/review/review-pinned-post'

export type ReviewPinnedPostClientProps = Omit<ReviewPinnedPostProps, 'onUploadImage'> & {
  /**
   * The AM's database user id. When provided the attach-image button
   * renders inside the popover composer. When absent (e.g. read-only
   * addressed bucket) it is suppressed.
   */
  userDbId?: string
}

export function ReviewPinnedPostClient({
  userDbId,
  ...rest
}: ReviewPinnedPostClientProps) {
  const handleUploadImage = useCallback(
    userDbId
      ? (file: File) => uploadCommentImage(file, { mode: 'internal', userDbId })
      : () => Promise.reject(new Error('No userDbId')),
    [userDbId],
  )

  return (
    <ReviewPinnedPost
      {...rest}
      onUploadImage={userDbId ? handleUploadImage : undefined}
    />
  )
}
