'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { cn } from '@/lib/utils'
import { useUnsavedChanges } from '@/lib/unsaved-changes'
import { Button } from '@/components/ui/button'
import { Linkify } from '@/components/ui/linkify'
import { FixWithAIButton } from '@/components/preview/fix-with-ai-button'
import {
  CommentImageAttachButton,
  type AttachedImage,
} from '@/components/preview/comment-image-attach-button'
import type { PinLocation, ThreadAuthor } from '@/types/preview'

/**
 * Shared popover that opens when a pin (image or caption) is clicked. Renders
 * the thread's first comment, any loaded follow-up comments, and a composer
 * for adding a new comment. Resolve action is only available in `internal`
 * mode (AM view).
 *
 * Position smart-flips to stay inside the viewport (anchor + intended size,
 * shifted up/left as needed).
 *
 * Layer 2 / Task 2.3.
 */
export type PinPopoverComment = {
  author: ThreadAuthor
  body: string
  createdAt: Date
  imageUrl?: string | null
  imageWidth?: number | null
  imageHeight?: number | null
}

export type PinPopoverThread = {
  id: string
  pin: PinLocation
  status: 'open' | 'resolved'
  firstComment: {
    author: ThreadAuthor
    body: string
    createdAt: Date
    imageUrl?: string | null
    imageWidth?: number | null
    imageHeight?: number | null
  }
  commentCount: number
  comments: ReadonlyArray<PinPopoverComment>
}

export type PinPopoverProps = {
  thread: PinPopoverThread
  anchor?: { x: number; y: number } | null
  mode: 'internal' | 'review'
  onComment: (body: string, image?: { url: string; width: number; height: number }) => Promise<void>
  onResolve?: () => Promise<void>
  onClose?: () => void
  className?: string
  /**
   * Post id is required to render the Fix with AI button (which calls the
   * /api/posts/[id]/fix-with-ai endpoint). When omitted, the button is
   * suppressed (host hasn't wired the integration yet). Layer 3 plan
   * Task 3.1 wires this from the preview page shell.
   */
  postId?: string
  /**
   * Original caption text for the post the thread belongs to. Optional;
   * surfaces in the diff modal so AM edits recompute the diff live.
   */
  postCaption?: string
  /** Called after the AM accepts an AI fix so the host can refresh. */
  onFixAccepted?: () => void
  /**
   * When provided, renders an "Attach image" button in the reply composer.
   * The host passes uploadCommentImage partially applied with the user's
   * identity so the component stays identity-agnostic.
   */
  onUploadImage?: (file: File) => Promise<{ url: string; width: number; height: number }>
}

const POPOVER_WIDTH = 320
// Rough height budget , covers header + ~3 comments + composer. Used for
// flip math when measuring isn't possible yet (first paint).
const POPOVER_HEIGHT_ESTIMATE = 280
const VIEWPORT_GUTTER = 8

export function PinPopover({
  thread,
  anchor,
  mode,
  onComment,
  onResolve,
  onClose,
  className,
  postId,
  postCaption,
  onFixAccepted,
  onUploadImage,
}: PinPopoverProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const [body, setBody] = useState('')
  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number }>(() =>
    computePosition(anchor ?? null, POPOVER_HEIGHT_ESTIMATE),
  )

  useLayoutEffect(() => {
    const el = popoverRef.current
    const height = el?.getBoundingClientRect().height ?? POPOVER_HEIGHT_ESTIMATE
    setPosition(computePosition(anchor ?? null, height))
  }, [anchor])

  // Warn before navigating away while an unsaved reply draft exists.
  useUnsavedChanges(body.trim().length > 0 || attachedImage !== null)

  // Single close guard: every close path (X, Escape, outside click) routes
  // through this so an unsaved draft prompts a discard confirmation first.
  const requestClose = useCallback(() => {
    if (!onClose) return
    if (
      (body.trim().length > 0 || attachedImage !== null) &&
      !window.confirm('Discard unsaved changes?')
    )
      return
    onClose()
  }, [onClose, body, attachedImage])

  useEffect(() => {
    if (!onClose) return
    function handle(event: KeyboardEvent) {
      if (event.key === 'Escape') requestClose()
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [onClose, requestClose])

  // Close on a pointer-down anywhere outside the popover (mirrors the
  // notification dropdown pattern). A click inside , including the textarea ,
  // is ignored via closest() on the stable testid.
  useEffect(() => {
    if (!onClose) return
    function onPointerDown(e: PointerEvent) {
      const el = e.target instanceof Element ? e.target : null
      if (el && el.closest('[data-testid="pin-popover"]')) return
      requestClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [onClose, requestClose])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = body.trim()
    // Allow submit when there's text OR an attached image (image-only reply).
    if ((!trimmed && !attachedImage) || submitting) return
    setSubmitting(true)
    try {
      await onComment(trimmed, attachedImage ?? undefined)
      setBody('')
      setAttachedImage(null)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResolve() {
    if (!onResolve || resolving) return
    setResolving(true)
    try {
      await onResolve()
    } finally {
      setResolving(false)
    }
  }

  const allComments: PinPopoverComment[] =
    thread.comments.length > 0
      ? [...thread.comments]
      : [
          {
            author: thread.firstComment.author,
            body: thread.firstComment.body,
            createdAt: thread.firstComment.createdAt,
          },
        ]

  const showResolveButton = mode === 'internal' && thread.status === 'open'
  // Fix with AI is AM-only and only for post-level / caption-text threads
  // (image pins don't drive caption rewrites in v1). The button itself
  // guards on these flags as well; we also need a known postId to call the
  // API endpoint, so suppress when missing.
  const showFixWithAi =
    mode === 'internal' &&
    thread.status === 'open' &&
    thread.pin.kind !== 'image' &&
    typeof postId === 'string'

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Feedback thread"
      data-testid="pin-popover"
      data-thread-id={thread.id}
      data-status={thread.status}
      data-mode={mode}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        width: POPOVER_WIDTH,
        zIndex: 60,
      }}
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-border bg-white p-3 text-[13px] text-[#262626] shadow-lg',
        className,
      )}
    >
      <header className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[#8e8e8e]">
          {pinKindLabel(thread.pin)} · {thread.status}
        </span>
        {onClose ? (
          <button
            type="button"
            data-testid="pin-popover-close"
            aria-label="Close thread"
            onClick={requestClose}
            className="text-[#8e8e8e] hover:text-[#262626]"
          >
            ×
          </button>
        ) : null}
      </header>

      <ol
        data-testid="pin-popover-comments"
        className="flex max-h-48 flex-col gap-2 overflow-y-auto"
      >
        {allComments.map((comment, index) => (
          <li key={index} className="flex flex-col gap-0.5">
            <span className="text-[11px] font-semibold text-[#262626]">
              {authorLabel(comment.author)}
            </span>
            <p className="whitespace-pre-line break-words text-[13px] leading-snug text-[#262626]">
              <Linkify text={comment.body} />
            </p>
          </li>
        ))}
      </ol>

      <form
        data-testid="pin-popover-composer"
        onSubmit={handleSubmit}
        className="flex flex-col gap-2"
      >
        <textarea
          data-testid="pin-popover-input"
          aria-label="Add a comment"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          disabled={submitting || thread.status === 'resolved'}
          rows={2}
          placeholder={
            thread.status === 'resolved'
              ? 'Thread resolved'
              : 'Add a comment...'
          }
          className="resize-none rounded-md border border-[#dbdbdb] bg-white px-2 py-1.5 text-[13px] text-[#262626] outline-none focus:border-[#8e8e8e]"
        />
        {onUploadImage && thread.status !== 'resolved' ? (
          <CommentImageAttachButton
            onUploadImage={onUploadImage}
            value={attachedImage}
            onChange={setAttachedImage}
            disabled={submitting}
          />
        ) : null}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {showFixWithAi && postId ? (
            <FixWithAIButton
              postId={postId}
              threadId={thread.id}
              pinKind={thread.pin.kind}
              mode={mode}
              originalCaption={postCaption}
              onAccepted={onFixAccepted}
            />
          ) : null}
          {showResolveButton && onResolve ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              data-testid="pin-popover-resolve"
              onClick={handleResolve}
              disabled={resolving}
            >
              {resolving ? 'Resolving...' : 'Resolve'}
            </Button>
          ) : null}
          <Button
            type="submit"
            variant="default"
            size="xs"
            data-testid="pin-popover-submit"
            disabled={submitting || (body.trim().length === 0 && attachedImage === null)}
          >
            {submitting ? 'Sending...' : 'Comment'}
          </Button>
        </div>
      </form>
    </div>
  )
}

function authorLabel(author: ThreadAuthor): string {
  return author.kind === 'am' ? author.name : author.reviewerName
}

function pinKindLabel(pin: PinLocation): string {
  switch (pin.kind) {
    case 'image':
      return 'Image pin'
    case 'caption':
      return 'Caption pin'
    case 'post':
      return 'Post thread'
  }
}

/**
 * Compute a top/left so the popover anchor (clicked pin coordinate, in
 * viewport pixels) sits to the right and below the anchor, but flips to the
 * left/up when that would push the popover off-screen.
 */
function computePosition(
  anchor: { x: number; y: number } | null,
  height: number,
): { top: number; left: number } {
  const viewportWidth =
    typeof window !== 'undefined' ? window.innerWidth : 1024
  const viewportHeight =
    typeof window !== 'undefined' ? window.innerHeight : 768

  if (!anchor) {
    // Center fallback.
    return {
      top: Math.max(VIEWPORT_GUTTER, (viewportHeight - height) / 2),
      left: Math.max(VIEWPORT_GUTTER, (viewportWidth - POPOVER_WIDTH) / 2),
    }
  }

  // Default: render to the right of and below the anchor.
  let left = anchor.x + 12
  let top = anchor.y + 12

  // Flip horizontally if the popover would overflow the right edge.
  if (left + POPOVER_WIDTH + VIEWPORT_GUTTER > viewportWidth) {
    left = anchor.x - POPOVER_WIDTH - 12
  }
  // Flip vertically if the popover would overflow the bottom edge.
  if (top + height + VIEWPORT_GUTTER > viewportHeight) {
    top = anchor.y - height - 12
  }

  // Final clamp inside viewport gutter.
  left = clamp(left, VIEWPORT_GUTTER, Math.max(VIEWPORT_GUTTER, viewportWidth - POPOVER_WIDTH - VIEWPORT_GUTTER))
  top = clamp(top, VIEWPORT_GUTTER, Math.max(VIEWPORT_GUTTER, viewportHeight - height - VIEWPORT_GUTTER))

  return { top, left }
}

function clamp(n: number, min: number, max: number): number {
  if (n < min) return min
  if (n > max) return max
  return n
}
