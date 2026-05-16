'use client'

import { useState } from 'react'
import { Globe, ThumbsUp, MessageCircle, Share2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FeedPostProps } from '@/types/preview'

// Facebook allows visibly longer captions before "See more" than IG.
// 280 chars is a reasonable mid fidelity threshold.
const FB_TRUNCATE_LIMIT = 280

function firstLetter(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  return trimmed.charAt(0).toUpperCase()
}

type Thread = FeedPostProps['threads'][number]

function pinAriaLabel(thread: Thread, index: number): string {
  const base = `Open feedback thread ${index + 1}`
  if (thread.pin.kind === 'image') return `${base} on image`
  if (thread.pin.kind === 'caption') return `${base} on caption`
  return base
}

export function FacebookPost(props: FeedPostProps) {
  const { post, client, threads, onOpenThread } = props
  const [expanded, setExpanded] = useState(false)

  const captionFull = post.caption ?? ''
  const needsTruncation = captionFull.length > FB_TRUNCATE_LIMIT
  const captionDisplay =
    expanded || !needsTruncation
      ? captionFull
      : captionFull.slice(0, FB_TRUNCATE_LIMIT).trimEnd()

  const imagePins = threads.filter(
    (t): t is Thread & { pin: { kind: 'image'; x: number; y: number } } =>
      t.pin.kind === 'image',
  )

  return (
    <article
      data-testid="facebook-post"
      data-post-id={post.id}
      className="w-full max-w-[500px] rounded-lg border border-[#dadde1] bg-white font-[system-ui,-apple-system,'Segoe_UI',sans-serif] text-[#1c1e21] shadow-sm"
    >
      {/* Header: avatar + client name + Sponsored row */}
      <header className="flex items-center gap-3 px-3 pt-3 pb-2">
        {client.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={client.avatarUrl}
            alt=""
            data-testid="fb-avatar-image"
            className="size-10 rounded-md object-cover"
          />
        ) : (
          <div
            data-testid="fb-avatar-fallback"
            aria-hidden="true"
            className="flex size-10 items-center justify-center rounded-md bg-[#1877f2] text-base font-bold text-white"
          >
            {firstLetter(client.name)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold leading-tight text-[#050505]">
            {client.name}
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-[12px] leading-tight text-[#65676b]">
            <span>Sponsored</span>
            <span aria-hidden="true">·</span>
            <Globe
              aria-label="Public"
              className="size-3"
              strokeWidth={2}
            />
          </div>
        </div>
      </header>

      {/* Caption ABOVE image (Facebook layout) */}
      <div
        data-testid="fb-caption"
        className="px-3 pb-2 text-[15px] leading-[1.3333] text-[#050505] whitespace-pre-line"
      >
        {captionDisplay}
        {needsTruncation && !expanded && (
          <>
            {'… '}
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="cursor-pointer font-semibold text-[#65676b] hover:underline"
            >
              See more
            </button>
          </>
        )}
        {post.hashtags.length > 0 && (
          <div className="mt-1 text-[#1877f2]">
            {post.hashtags
              .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`))
              .join(' ')}
          </div>
        )}
      </div>

      {/* Image (1.91:1 FB feed aspect) */}
      <div className="relative">
        {post.mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.mediaUrl}
            alt=""
            data-testid="fb-media"
            className="block w-full"
            style={{ aspectRatio: '1.91 / 1', objectFit: 'cover' }}
          />
        ) : (
          <div
            data-testid="fb-media-placeholder"
            className="flex w-full items-center justify-center bg-gradient-to-br from-[#7ad3f5] to-[#3e8dc4] text-xs text-white/80"
            style={{ aspectRatio: '1.91 / 1' }}
          >
            image goes here
          </div>
        )}

        {/* Image pin badges */}
        {imagePins.map((thread, index) => (
          <button
            key={thread.id}
            type="button"
            data-testid="fb-pin-badge"
            data-thread-id={thread.id}
            aria-label={pinAriaLabel(thread, index)}
            onClick={() => onOpenThread?.(thread.id)}
            className={cn(
              'absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-bold text-white shadow-md ring-2 ring-white transition hover:scale-110',
              thread.status === 'resolved'
                ? 'bg-[#65676b]/80'
                : 'bg-[#1877f2]',
            )}
            style={{ left: `${thread.pin.x}%`, top: `${thread.pin.y}%` }}
          >
            {index + 1}
          </button>
        ))}
      </div>

      {/* Action row: Like / Comment / Share */}
      <div className="mt-1 flex items-center justify-around border-t border-[#ced0d4] px-3 py-1">
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-2 rounded-md py-1.5 text-[15px] font-semibold text-[#65676b] hover:bg-[#f2f2f2]"
        >
          <ThumbsUp className="size-5" />
          <span>Like</span>
        </button>
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-2 rounded-md py-1.5 text-[15px] font-semibold text-[#65676b] hover:bg-[#f2f2f2]"
        >
          <MessageCircle className="size-5" />
          <span>Comment</span>
        </button>
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-2 rounded-md py-1.5 text-[15px] font-semibold text-[#65676b] hover:bg-[#f2f2f2]"
        >
          <Share2 className="size-5" />
          <span>Share</span>
        </button>
      </div>
    </article>
  )
}
