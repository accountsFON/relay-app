import * as React from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * DataRow: Wise-style list row.
 * Avatar (or icon) + 2-line text + right-aligned meta + chevron.
 * No row borders, rhythm comes from padding alone.
 *
 * Used for: clients list, runs list, posts list, recipients-style surfaces.
 */
export function DataRow({
  href,
  leading,
  title,
  subtitle,
  meta,
  metaLabel,
  className,
  trailing,
  onClick,
}: {
  href?: string
  leading?: React.ReactNode
  title: React.ReactNode
  subtitle?: React.ReactNode
  meta?: React.ReactNode
  metaLabel?: React.ReactNode
  trailing?: React.ReactNode
  className?: string
  onClick?: () => void
}) {
  const content = (
    <div
      className={cn(
        'flex items-center gap-4 px-5 py-4 transition-colors',
        href || onClick ? 'hover:bg-neutral-100/60 cursor-pointer' : '',
        className
      )}
    >
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold text-foreground truncate">
          {title}
        </div>
        {subtitle && (
          <div className="mt-0.5 text-[13px] text-muted-foreground truncate">
            {subtitle}
          </div>
        )}
      </div>
      {(meta || metaLabel) && (
        <div className="shrink-0 text-right">
          {meta && (
            <div className="text-[15px] font-semibold text-foreground tabular-nums">
              {meta}
            </div>
          )}
          {metaLabel && (
            <div className="mt-0.5 text-[13px] text-muted-foreground tabular-nums">
              {metaLabel}
            </div>
          )}
        </div>
      )}
      {trailing && <div className="shrink-0">{trailing}</div>}
      {href && <ChevronRight className="shrink-0 size-4 text-muted-foreground" />}
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="block w-full text-left">
        {content}
      </button>
    )
  }
  return content
}

/**
 * DataRowGroup: wraps DataRows in the standard card chrome.
 * Optional sectioned (date-grouped) variant.
 */
export function DataRowGroup({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl bg-card divide-y divide-border',
        className
      )}
    >
      {children}
    </div>
  )
}

/**
 * Avatar bubble for DataRow leading slot: initials, photo, or icon.
 */
export function RowAvatar({
  initials,
  icon,
  src,
  className,
}: {
  initials?: string
  icon?: React.ReactNode
  src?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex size-10 items-center justify-center rounded-full bg-neutral-100 text-[13px] font-semibold text-neutral-700',
        className
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full rounded-full object-cover" />
      ) : icon ? (
        icon
      ) : initials ? (
        initials.slice(0, 2).toUpperCase()
      ) : null}
    </div>
  )
}
