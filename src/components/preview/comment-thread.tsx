'use client'

import { useState, type FormEvent } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Linkify } from '@/components/ui/linkify'
import type { ThreadAuthor } from '@/types/preview'

/**
 * A lean inline comment thread for the client review surface. Unlike the
 * floating {@link PinPopover}, this renders the comment list and composer
 * stacked in place (used for a post-level "Comments" discussion under the
 * Notes block). Text-only composer for v1 — no image attach.
 */
export type CommentThreadComment = {
  id: string
  author:
    | { kind: 'am'; name: string }
    | { kind: 'client'; reviewerName: string }
    | ThreadAuthor
  body: string
  imageUrl?: string | null
}

export type CommentThreadProps = {
  comments: ReadonlyArray<CommentThreadComment>
  onSend: (body: string) => void | Promise<void>
  /** When true, hide the composer (e.g. a resolved thread). */
  readOnly?: boolean
  placeholder?: string
  className?: string
}

export function CommentThread({
  comments,
  onSend,
  readOnly,
  placeholder,
  className,
}: CommentThreadProps) {
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = body.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    try {
      await onSend(trimmed)
      setBody('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <ul className="flex flex-col gap-2">
        {comments.map((comment) => (
          <li
            key={comment.id}
            data-testid="comment-row"
            className="flex flex-col gap-0.5"
          >
            <span className="text-[11px] font-semibold text-[#262626]">
              {authorLabel(comment.author)}
            </span>
            <p className="whitespace-pre-line break-words text-[13px] leading-snug text-[#262626]">
              <Linkify text={comment.body} />
            </p>
            {comment.imageUrl ? (
              <a
                href={comment.imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block"
              >
                <img
                  data-testid="comment-image"
                  src={comment.imageUrl}
                  alt="Reference attachment"
                  className="max-h-40 w-auto max-w-[240px] rounded border border-[#dbdbdb] object-contain"
                />
              </a>
            ) : null}
          </li>
        ))}
      </ul>

      {readOnly ? null : (
        <form
          data-testid="comment-composer"
          onSubmit={handleSubmit}
          className="flex flex-col gap-2"
        >
          <textarea
            data-testid="comment-composer-input"
            aria-label="Add a comment"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={submitting}
            rows={2}
            placeholder={placeholder ?? 'Add a comment...'}
            className="resize-none rounded-md border border-[#dbdbdb] bg-white px-2 py-1.5 text-[13px] text-[#262626] outline-none focus:border-[#8e8e8e]"
          />
          <div className="flex items-center justify-end">
            <Button
              type="submit"
              variant="default"
              size="xs"
              data-testid="comment-composer-send"
              disabled={submitting || body.trim().length === 0}
            >
              {submitting ? 'Sending...' : 'Send'}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

function authorLabel(author: CommentThreadComment['author']): string {
  return author.kind === 'am' ? author.name : author.reviewerName
}
