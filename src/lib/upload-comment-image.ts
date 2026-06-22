import { upload } from '@vercel/blob/client'
import {
  buildAmCommentImagePathname,
  buildReviewerCommentImagePathname,
} from '@/lib/comment-image'

async function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      resolve({ width: 0, height: 0 })
      URL.revokeObjectURL(url)
    }
    img.src = url
  })
}

export type CommentImageUploadIdentity =
  | { mode: 'internal'; userDbId: string }
  | { mode: 'review'; token: string; tokenHash: string }

export async function uploadCommentImage(
  file: File,
  identity: CommentImageUploadIdentity,
): Promise<{ url: string; width: number; height: number }> {
  const dims = await readImageSize(file)
  const handleUploadUrl =
    identity.mode === 'review'
      ? `/api/review/${identity.token}/comment-image/upload`
      : '/api/comment-image/upload'
  const pathname =
    identity.mode === 'review'
      ? buildReviewerCommentImagePathname(identity.tokenHash, file.name)
      : buildAmCommentImagePathname(identity.userDbId, file.name)
  const result = await upload(pathname, file, {
    access: 'public',
    handleUploadUrl,
    contentType: file.type,
  })
  return { url: result.url, width: dims.width, height: dims.height }
}
