import { upload } from '@vercel/blob/client'
import { buildFeedbackImagePathname } from '@/lib/feedback-image'

/**
 * Client-side: upload a screenshot for a bug report directly to Vercel Blob
 * via the signed-token route, returning the public blob URL to submit with
 * the feedback. Mirrors src/lib/upload-comment-image.ts.
 */
export async function uploadFeedbackImage(file: File): Promise<{ url: string }> {
  const pathname = buildFeedbackImagePathname(file.name)
  const result = await upload(pathname, file, {
    access: 'public',
    handleUploadUrl: '/api/feedback/image/upload',
    contentType: file.type,
  })
  return { url: result.url }
}
