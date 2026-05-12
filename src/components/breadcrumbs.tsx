import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface BreadcrumbItem {
  /** Visible label */
  label: string
  /** Omit on the current (last) crumb to render as plain text */
  href?: string
}

/**
 * Breadcrumbs — horizontal trail of links culminating in the current page.
 * The last crumb (with no `href`) renders as plain foreground text.
 */
export function Breadcrumbs({
  items,
  className,
}: {
  items: BreadcrumbItem[]
  className?: string
}) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        'flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground',
        className,
      )}
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        return (
          <span key={`${item.label}-${i}`} className="flex items-center gap-1.5">
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="rounded px-1 py-0.5 transition-colors hover:bg-cream-warm hover:text-foreground"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className="px-1 py-0.5 text-foreground"
                aria-current={isLast ? 'page' : undefined}
              >
                {item.label}
              </span>
            )}
            {!isLast && (
              <ChevronRight className="size-3.5 text-muted-foreground/60" aria-hidden />
            )}
          </span>
        )
      })}
    </nav>
  )
}
