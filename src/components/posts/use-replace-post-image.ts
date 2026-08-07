'use client'

import { useState, useTransition } from 'react'
import { upload } from '@vercel/blob/client'
import { useRouter } from 'next/navigation'

export type UseReplacePostImage = {
  replace: (file: File) => void
  clear: () => void
  isPending: boolean
  error: string | null
}

/**
 * Single source of truth for writing a post's image. Blob upload (signed via
 * /api/media/upload with the postId payload) → POST /api/posts/[id]/media →
 * optional callback → optional router.refresh().
 *
 * - `replace(file)` uploads and persists the new image.
 * - `clear()` persists an empty url (removes the image).
 * - `refresh` (default true) controls the trailing router.refresh(); callers
 *   whose parent already re-renders on the callback pass `false`.
 */
export function useReplacePostImage(
  postId: string,
  opts?: {
    onUploaded?: (url: string) => void
    onCleared?: () => void
    refresh?: boolean
  },
): UseReplacePostImage {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const shouldRefresh = opts?.refresh ?? true

  async function persist(url: string) {
    const res = await fetch(`/api/posts/${postId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    if (!res.ok) throw new Error(`Persist URL failed: ${await res.text()}`)
  }

  function replace(file: File) {
    setError(null)
    startTransition(async () => {
      try {
        const result = await upload(file.name, file, {
          access: 'public',
          handleUploadUrl: '/api/media/upload',
          clientPayload: postId,
        })
        await persist(result.url)
        opts?.onUploaded?.(result.url)
        if (shouldRefresh) router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  function clear() {
    setError(null)
    startTransition(async () => {
      try {
        await persist('')
        opts?.onCleared?.()
        if (shouldRefresh) router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  return { replace, clear, isPending, error }
}
