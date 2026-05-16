'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import type { FeedPostProps, PinLocation } from '@/types/preview'

/**
 * Instagram feed post (mid fidelity).
 *
 * Pure presentational component. Renders a single Post inside Instagram-like
 * chrome (avatar gradient, bold username, Sponsored subline, square 1/1 image,
 * heart/comment/share row, caption with "...more" truncation past 120 chars).
 *
 * Layer 1 (this PR): renders the chrome and emits onOpenThread on pin clicks.
 * Layer 2: wires up real thread composers and onCreateThread handlers.
 *
 * Reference: design doc § Locked decisions #2 (mid fidelity rendering).
 */

const CAPTION_TRUNCATE_AT = 120

function instagramHandle(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 30) || 'client'
}

function pinKindLabel(pin: PinLocation): string {
  switch (pin.kind) {
    case 'image':
      return 'image pin'
    case 'caption':
      return 'caption pin'
    case 'post':
      return 'post pin'
  }
}

export function InstagramFeedPost({
  post,
  client,
  threads,
  mode,
  onOpenThread,
}: FeedPostProps) {
  const [expanded, setExpanded] = useState(false)

  const handle = useMemo(() => instagramHandle(client.name), [client.name])

  const isLong = post.caption.length > CAPTION_TRUNCATE_AT
  const visibleCaption =
    isLong && !expanded
      ? post.caption.slice(0, CAPTION_TRUNCATE_AT).trimEnd()
      : post.caption

  // Numbered pins on the image (rendered as overlay badges).
  const imagePins = threads.filter((t) => t.pin.kind === 'image')

  return (
    <article
      data-testid="instagram-post"
      data-post-id={post.id}
      data-mode={mode}
      className="mx-auto w-full max-w-[470px] overflow-hidden rounded-lg border border-[#dbdbdb] bg-white text-[14px] text-[#262626]"
    >
      {/* Header: avatar + username + Sponsored */}
      <header className="flex items-center gap-3 px-3 py-2.5">
        <span
          aria-hidden="true"
          className="relative inline-block size-8 rounded-full p-[2px]"
          style={{
            background:
              'conic-gradient(from 180deg at 50% 50%, #feda75, #fa7e1e, #d62976, #962fbf, #4f5bd5, #feda75)',
          }}
        >
          {client.avatarUrl ? (
            <img
              src={client.avatarUrl}
              alt={`${client.name} avatar`}
              data-testid="instagram-post-avatar"
              className="block size-full rounded-full border-2 border-white object-cover"
            />
          ) : (
            <span
              data-testid="instagram-post-avatar"
              data-fallback="1"
              className="flex size-full items-center justify-center rounded-full border-2 border-white bg-white text-[12px] font-semibold uppercase text-[#262626]"
            >
              {client.name.charAt(0) || '?'}
            </span>
          )}
        </span>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-[14px] font-semibold text-[#262626]">
            {handle}
          </span>
          <span className="truncate text-[12px] text-[#8e8e8e]">Sponsored</span>
        </div>
      </header>

      {/* Square media */}
      <div
        className="relative aspect-square w-full overflow-hidden bg-[#fafafa]"
        data-testid="instagram-post-media"
      >
        {post.mediaUrl ? (
          <img
            src={post.mediaUrl}
            alt=""
            className="block size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-[13px] text-[#8e8e8e]">
            image goes here
          </div>
        )}

        {imagePins.map((thread, idx) => {
          if (thread.pin.kind !== 'image') return null
          const { x, y } = thread.pin
          return (
            <button
              key={thread.id}
              type="button"
              data-testid="instagram-post-pin"
              data-thread-id={thread.id}
              aria-label={`Open ${pinKindLabel(thread.pin)} thread`}
              onClick={() => onOpenThread?.(thread.id)}
              className={cn(
                'absolute -translate-x-1/2 -translate-y-1/2 rounded-full text-[11px] font-semibold leading-none shadow-md transition-transform',
                'flex size-6 items-center justify-center',
                thread.status === 'open'
                  ? 'bg-amber-400 text-[#262626] hover:scale-110'
                  : 'bg-[#dbdbdb] text-[#8e8e8e] hover:scale-105',
              )}
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              {idx + 1}
            </button>
          )
        })}
      </div>

      {/* Action row */}
      <div
        className="flex items-center gap-4 px-3 pt-2 pb-1 text-[22px] leading-none text-[#262626]"
        aria-hidden="true"
      >
        <span>♡</span>
        <span>💬</span>
        <span>↗</span>
      </div>

      {/* Caption */}
      <div className="px-3 pt-1 pb-3 text-[14px] leading-snug text-[#262626]">
        <p
          className="whitespace-pre-line"
          data-testid="instagram-post-caption"
        >
          <b className="font-semibold">{handle}</b>{' '}
          <span data-testid="instagram-post-caption-text">{visibleCaption}</span>
          {isLong && !expanded && (
            <>
              {'... '}
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="text-[#8e8e8e] hover:text-[#262626]"
                data-testid="instagram-post-more"
              >
                more
              </button>
            </>
          )}
        </p>

        {post.hashtags.length > 0 && (
          <p
            className="mt-1 text-[14px] text-[#00376b]"
            data-testid="instagram-post-hashtags"
          >
            {post.hashtags
              .map((h) => (h.startsWith('#') ? h : `#${h}`))
              .join(' ')}
          </p>
        )}

        {/* Caption-pin or post-pin badges live below the caption text. */}
        {threads.some((t) => t.pin.kind !== 'image') && (
          <div
            className="mt-2 flex flex-wrap items-center gap-1.5"
            data-testid="instagram-post-non-image-pins"
          >
            {threads
              .filter((t) => t.pin.kind !== 'image')
              .map((thread, idx) => (
                <button
                  key={thread.id}
                  type="button"
                  data-testid="instagram-post-pin"
                  data-thread-id={thread.id}
                  aria-label={`Open ${pinKindLabel(thread.pin)} thread`}
                  onClick={() => onOpenThread?.(thread.id)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                    thread.status === 'open'
                      ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                      : 'bg-[#efefef] text-[#8e8e8e] hover:bg-[#e5e5e5]',
                  )}
                >
                  <span aria-hidden="true">📍</span>
                  <span>
                    {thread.pin.kind === 'caption' ? 'Caption' : 'Post'} ·{' '}
                    {thread.commentCount}
                  </span>
                </button>
              ))}
          </div>
        )}
      </div>
    </article>
  )
}
