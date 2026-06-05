'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { MediaUpload } from '@/components/posts/media-upload'

/**
 * Client wrapper for ONE attention post on the AM review-session detail page.
 *
 * The server page builds the per-post decision UI (ReviewItemRow /
 * ReviewPinnedPost / MarkAddressedButton) and passes it in as `children`.
 * This component renders that block unchanged, then layers on the two
 * edit affordances that need client state:
 *
 *  - Inline caption editor (gated by canEditCaption == client.edit). Toggles
 *    an editing state, edits a local draft, and on Save calls the bound
 *    `updateCaption` server action inside a transition, then refreshes.
 *  - Image upload / replace control (gated by canUploadImage ==
 *    post.media.edit), reusing the shared MediaUpload drop zone. onUploaded
 *    refreshes the route so the new mediaUrls[0] is reflected.
 *
 * Both capability flags are computed on the SERVER from OrgContext and passed
 * down; this component never decides permissions itself.
 */
export type ReviewAttentionCardProps = {
  postId: string
  postNumber: number
  caption: string
  mediaUrls: string[]
  canEditCaption: boolean
  canUploadImage: boolean
  children?: ReactNode
  /** Bound server action wrapping updatePostAction (caption-only save). */
  updateCaption: (postId: string, caption: string) => Promise<void>
}

export function ReviewAttentionCard({
  postId,
  caption,
  mediaUrls,
  canEditCaption,
  canUploadImage,
  children,
  updateCaption,
}: ReviewAttentionCardProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(caption)
  const [isPending, startTransition] = useTransition()

  const mediaUrl = mediaUrls[0] ?? null

  const handleEdit = () => {
    setDraft(caption)
    setIsEditing(true)
  }

  const handleCancel = () => {
    setDraft(caption)
    setIsEditing(false)
  }

  const handleSave = () => {
    startTransition(async () => {
      await updateCaption(postId, draft)
      setIsEditing(false)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3" data-testid={`review-attention-card-${postId}`}>
      {children}

      {(canEditCaption || canUploadImage) && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          {canEditCaption &&
            (isEditing ? (
              <div className="space-y-2">
                <Textarea
                  data-testid="caption-editor-textarea"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={4}
                  aria-label="Edit caption"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCancel}
                    disabled={isPending}
                    data-testid="caption-editor-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSave}
                    disabled={isPending}
                    data-testid="caption-editor-save"
                  >
                    {isPending ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {caption}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleEdit}
                  data-testid="edit-caption-button"
                >
                  Edit caption
                </Button>
              </div>
            ))}

          {canUploadImage && (
            <MediaUpload
              postId={postId}
              currentMediaUrl={mediaUrl}
              onUploaded={() => router.refresh()}
            />
          )}
        </div>
      )}
    </div>
  )
}
