import { describe, it, expect } from 'vitest'
import {
  FEEDBACK_IMAGE_PREFIX,
  buildFeedbackImagePathname,
  isFeedbackImageBlobUrl,
} from '@/lib/feedback-image'

describe('buildFeedbackImagePathname', () => {
  it('places the file under the feedback-images/ prefix', () => {
    expect(buildFeedbackImagePathname('shot.png')).toMatch(
      new RegExp(`^${FEEDBACK_IMAGE_PREFIX}/\\d+-shot\\.png$`),
    )
  })

  it('sanitizes path separators in the filename', () => {
    const p = buildFeedbackImagePathname('a/b\\c.png')
    expect(p.startsWith(`${FEEDBACK_IMAGE_PREFIX}/`)).toBe(true)
    expect(p).not.toMatch(/[\\/].*[\\/].*[\\/]/) // no nested dirs from the name
    expect(p).toContain('a_b_c.png')
  })
})

describe('isFeedbackImageBlobUrl', () => {
  it('accepts an https Vercel Blob URL under feedback-images/', () => {
    expect(
      isFeedbackImageBlobUrl(
        'https://x.public.blob.vercel-storage.com/feedback-images/1-shot.png',
      ),
    ).toBe(true)
    expect(
      isFeedbackImageBlobUrl(
        'https://stub.blob.vercel-storage.test/feedback-images/1-shot.png',
      ),
    ).toBe(true)
  })

  it('rejects a blob URL under a different prefix (e.g. comment-images)', () => {
    expect(
      isFeedbackImageBlobUrl(
        'https://x.public.blob.vercel-storage.com/comment-images/am/u1/1-x.png',
      ),
    ).toBe(false)
  })

  it('rejects non-https, non-vercel-storage hosts, and garbage', () => {
    expect(
      isFeedbackImageBlobUrl(
        'http://x.public.blob.vercel-storage.com/feedback-images/1-x.png',
      ),
    ).toBe(false)
    expect(
      isFeedbackImageBlobUrl('https://evil.com/feedback-images/1-x.png'),
    ).toBe(false)
    expect(isFeedbackImageBlobUrl('not a url')).toBe(false)
    expect(isFeedbackImageBlobUrl('')).toBe(false)
  })
})
