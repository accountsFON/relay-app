'use client'

import { useState, useTransition } from 'react'
import { upload } from '@vercel/blob/client'
import { useRouter } from 'next/navigation'

export type UseReplacePostImage = {
  replace: (file: File) => void
  isPending: boolean
  error: string | null
}

/**
 * Swap a post's image: blob upload (signed via /api/media/upload with the
 * postId payload) → POST /api/posts/[id]/media → router.refresh(). Single
 * source of truth for replacing a post image.
 */
export function useReplacePostImage(
  postId: string,
  opts?: { onUploaded?: (url: string) => void },
): UseReplacePostImage {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function replace(file: File) {
    setError(null)
    startTransition(async () => {
      try {
        const result = await upload(file.name, file, {
          access: 'public',
          handleUploadUrl: '/api/media/upload',
          clientPayload: postId,
        })
        const res = await fetch(`/api/posts/${postId}/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: result.url }),
        })
        if (!res.ok) throw new Error(`Persist URL failed: ${await res.text()}`)
        opts?.onUploaded?.(result.url)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  return { replace, isPending, error }
}
