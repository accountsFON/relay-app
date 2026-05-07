import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * ActionBar — horizontal row of pill buttons for entity detail pages.
 * First action is typically primary, rest are ghost/outline.
 * Wraps cleanly on mobile.
 */
export function ActionBar({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {children}
    </div>
  )
}
