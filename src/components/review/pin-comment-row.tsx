'use client'

import { useState, useTransition } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CommentImageAttachButton,
  type AttachedImage,
} from '@/components/preview/comment-image-attach-button'
import type { HydratedThread } from '@/server/repositories/threads'
import type { ThreadAuthor } from '@/types/preview'

type HydratedComment = HydratedThread['comments'][number]

export type PinCommentRowProps = {
  thread: HydratedThread
  pinLabel: string
  expanded: boolean
  onToggle: () => void
  /** Reply composer callback. Omit to render the thread read-only (no
   *  composer, no image attach) — used by the designer's read-only view. */
  onComment?: (
    threadId: string,
    body: string,
    image?: { url: string; width?: number; height?: number },
  ) => Promise<void>
  onResolve?: (threadId: string) => Promise<void>
  onUseAsPostImage?: (commentId: string) => Promise<void>
  onUploadImage?: (file: File) => Promise<{ url: string; width: number; height: number }>
}

function authorName(a: ThreadAuthor): string {
  return a.kind === 'am' ? a.name : a.reviewerName
}

export function PinCommentRow({
  thread,
  pinLabel,
  expanded,
  onToggle,
  onComment,
  onResolve,
  onUseAsPostImage,
  onUploadImage,
}: PinCommentRowProps) {
  const [draft, setDraft] = useState('')
  const [pendingImage, setPendingImage] = useState<AttachedImage | null>(null)
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const replyCount = thread.comments.length - 1
  const firstComment = thread.firstComment
  const replies = thread.comments.slice(1)

  async function send() {
    if (!onComment) return
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
    <div className="flex flex-col">
      {/* Header — always visible */}
      <button
        type="button"
        data-testid={`pin-comment-row-${thread.id}`}
        data-expanded={String(expanded)}
        aria-expanded={expanded}
        onClick={onToggle}
        className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-muted/50"
      >
        {/* Chevron */}
        <ChevronRight
          className={cn(
            'mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-90',
          )}
        />

        {/* Pin marker */}
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
          {pinLabel}
        </span>

        {/* Author + body */}
        <div className="min-w-0 flex-1">
          <span className="text-[12px] font-semibold text-foreground">
            {authorName(firstComment.author)}
          </span>
          {firstComment.body ? (
            <p
              className={cn(
                'whitespace-pre-wrap break-words text-[13px] text-foreground',
              )}
            >
              {firstComment.body}
            </p>
          ) : (
            <em className="text-[13px] text-muted-foreground"> No comment</em>
          )}
        </div>

        {/* Reply count badge */}
        {replyCount > 0 && (
          <span
            data-testid={`pin-comment-row-reply-count-${thread.id}`}
            className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
          >
            {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
          </span>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="flex flex-col gap-2 px-9 pb-2">
          {/* First comment image */}
          {firstComment.imageUrl && (
            <a
              href={firstComment.imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                data-testid="pin-comment-image"
                src={firstComment.imageUrl}
                width={firstComment.imageWidth ?? undefined}
                height={firstComment.imageHeight ?? undefined}
                alt="Attachment"
                className="max-h-40 w-auto max-w-[240px] rounded border border-border object-contain"
              />
            </a>
          )}

          {/* "Use as post image" for first comment */}
          {firstComment.imageUrl && onUseAsPostImage && (
            <button
              type="button"
              onClick={() =>
                start(() => {
                  void onUseAsPostImage(firstComment.id)
                })
              }
              disabled={busy}
              className="self-start text-xs text-sky-700 underline-offset-2 hover:underline disabled:opacity-60"
            >
              Use as post image
            </button>
          )}

          {/* Replies */}
          {replies.map((c: HydratedComment) => (
            <div
              key={c.id}
              data-testid="pin-comment-reply"
              className="flex flex-col gap-1 text-[13px] text-foreground"
            >
              <div>
                <span className="font-semibold">{authorName(c.author)}</span>
                {c.body ? (
                  <>
                    {' — '}
                    <span className="whitespace-pre-wrap break-words">{c.body}</span>
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
            </div>
          ))}

          {/* Composer (reply + image attach). Omitted in the designer's
              read-only view, where onComment is not provided. */}
          {onComment && (
            <>
              {/* Error */}
              {error && (
                <p
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {error}
                </p>
              )}

              {/* Image attach */}
              {onUploadImage && (
                <CommentImageAttachButton
                  onUploadImage={onUploadImage}
                  value={pendingImage}
                  onChange={setPendingImage}
                  disabled={busy}
                />
              )}

              {/* Composer */}
              <div className="flex items-end gap-2">
                <textarea
                  data-testid={`pin-comment-input-${thread.id}`}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={2}
                  placeholder="Reply…"
                  className="min-h-[44px] flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  data-testid={`pin-comment-send-${thread.id}`}
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
            </>
          )}

          {/* Resolve */}
          {onResolve && thread.status === 'open' && (
            <button
              type="button"
              data-testid={`pin-comment-resolve-${thread.id}`}
              onClick={() =>
                start(() => {
                  void onResolve(thread.id)
                })
              }
              disabled={busy}
              className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-60"
            >
              Mark resolved
            </button>
          )}
        </div>
      )}
    </div>
  )
}
