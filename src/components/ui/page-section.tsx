import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * PageSection: labeled card section for grouping related content.
 * Replaces the inline `<Section>` definitions scattered across pages.
 */
export function PageSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-3', className)}>
      {(title || action) && (
        <div className="flex items-end justify-between gap-3 px-1">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className="rounded-2xl bg-card">
        <div className="p-5 sm:p-6">{children}</div>
      </div>
    </section>
  )
}
