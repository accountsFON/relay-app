'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import {
  CommentImageAttachButton,
  type AttachedImage,
} from '@/components/preview/comment-image-attach-button'
import type { HydratedThread } from '@/server/repositories/threads'
import type { ThreadAuthor } from '@/types/preview'

// Inline the comment shape from HydratedThread['comments'][number] so we can
// annotate the map callback without exporting a separate type.
type HydratedComment = HydratedThread['comments'][number]

export type ThreadConversationProps = {
  thread: HydratedThread
  onComment: (threadId: string, body: string, image?: { url: string; width?: number; height?: number }) => Promise<void>
  onResolve?: (threadId: string) => Promise<void>
  onUseAsPostImage?: (commentId: string) => Promise<void>
  /**
   * When provided, renders a paperclip "Attach image" button in the reply
   * composer. The host passes uploadCommentImage partially applied with the
   * user's identity so this component stays identity-agnostic.
   */
  onUploadImage?: (file: File) => Promise<{ url: string; width: number; height: number }>
}

function authorName(a: ThreadAuthor): string {
  return a.kind === 'am' ? a.name : a.reviewerName
}

export function ThreadConversation({
  thread,
  onComment,
  onResolve,
  onUseAsPostImage,
  onUploadImage,
}: ThreadConversationProps) {
  const [draft, setDraft] = useState('')
  const [pendingImage, setPendingImage] = useState<AttachedImage | null>(null)
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function send() {
    const body = draft.trim()
    if (!body && !pendingImage) return
    setError(null)
    try {
      await onComment(thread.id, body, pendingImage ?? undefined)
      setDraft('')
      setPendingImage(null)
    } catch {
      setError("Couldn't post your reply. Please try again.")
    }
  }

  return (
    <div data-testid="thread-conversation" className="space-y-2">
      <ol className="space-y-2">
        {thread.comments.map((c: HydratedComment) => (
          <li
            key={c.id}
            data-testid="thread-conversation-comment"
            className="flex flex-col gap-1 text-[13px] text-foreground"
          >
            <div>
              <span className="font-semibold">{authorName(c.author)}</span>
              {c.body ? (
                <>
                  {' — '}
                  <span>{c.body}</span>
                </>
              ) : (
                <em className="text-muted-foreground"> — No comment</em>
              )}
            </div>
            {c.imageUrl && (
              <a
                href={c.imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  data-testid="thread-conversation-image"
                  src={c.imageUrl}
                  width={c.imageWidth ?? undefined}
                  height={c.imageHeight ?? undefined}
                  alt="Attachment"
                  className="max-h-40 w-auto max-w-[240px] rounded border border-border object-contain"
                />
              </a>
            )}
            {c.imageUrl && onUseAsPostImage && (
              <button
                type="button"
                data-testid="thread-conversation-use-image"
                onClick={() =>
                  start(() => {
                    void onUseAsPostImage(c.id)
                  })
                }
                disabled={busy}
                className="self-start text-xs text-sky-700 underline-offset-2 hover:underline disabled:opacity-60"
              >
                Use as post image
              </button>
            )}
          </li>
        ))}
      </ol>

      {error && (
        <p
          role="alert"
          data-testid="thread-conversation-error"
          className="text-xs text-destructive"
        >
          {error}
        </p>
      )}

      {onUploadImage && (
        <CommentImageAttachButton
          onUploadImage={onUploadImage}
          value={pendingImage}
          onChange={setPendingImage}
          disabled={busy}
        />
      )}

      <div className="flex items-end gap-2">
        <textarea
          data-testid="thread-conversation-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Reply to the client…"
          className="min-h-[44px] flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          type="button"
          data-testid="thread-conversation-send"
          onClick={() =>
            start(() => {
              void send()
            })
          }
          disabled={busy}
          className="min-h-[44px] rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          Send
        </button>
      </div>

      {onResolve && thread.status === 'open' && (
        <button
          type="button"
          data-testid="thread-conversation-resolve"
          onClick={() =>
            start(() => {
              void onResolve(thread.id)
            })
          }
          disabled={busy}
          className={cn(
            'text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-60',
          )}
        >
          Mark resolved
        </button>
      )}
    </div>
  )
}
