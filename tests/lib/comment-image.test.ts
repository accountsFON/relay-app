import { describe, it, expect } from 'vitest'
import {
  COMMENT_IMAGE_PREFIX,
  buildAmCommentImagePathname,
  buildReviewerCommentImagePathname,
  isCommentImageBlobUrl,
} from '@/lib/comment-image'

describe('comment-image blob paths', () => {
  it('AM pathname is under comment-images/am/<userId>/', () => {
    expect(buildAmCommentImagePathname('u_1', 'a/b.png')).toMatch(
      /^comment-images\/am\/u_1\/\d+-a_b\.png$/,
    )
  })
  it('reviewer pathname is under comment-images/review/<hash>/', () => {
    expect(buildReviewerCommentImagePathname('h_1', 'x.webp')).toMatch(
      /^comment-images\/review\/h_1\/\d+-x\.webp$/,
    )
  })
  it('isCommentImageBlobUrl accepts a blob URL under the prefix', () => {
    expect(isCommentImageBlobUrl('https://abc.public.blob.vercel-storage.com/comment-images/am/u_1/1-x.png')).toBe(true)
  })
  it('rejects non-blob host, http, and wrong prefix', () => {
    expect(isCommentImageBlobUrl('https://evil.com/comment-images/x.png')).toBe(false)
    expect(isCommentImageBlobUrl('http://abc.public.blob.vercel-storage.com/comment-images/x.png')).toBe(false)
    expect(isCommentImageBlobUrl('https://abc.public.blob.vercel-storage.com/user-avatars/x.png')).toBe(false)
  })
})
