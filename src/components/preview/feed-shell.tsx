'use client'

import { cn } from '@/lib/utils'
import { PlatformToggle, type Platform } from './platform-toggle'

export type FeedShellProps = {
  platform: Platform
  onPlatformChange: (platform: Platform) => void
  children: React.ReactNode
  className?: string
}

/**
 * Single-column scroll wrapper that hosts a list of preview feed posts.
 * Renders the PlatformToggle pinned to the top, then children stacked
 * below in a column whose max width matches the Instagram feed (~470px).
 *
 * Mobile: full width below sm breakpoint, with horizontal padding so
 * cards don't kiss the screen edge.
 */
export function FeedShell({
  platform,
  onPlatformChange,
  children,
  className,
}: FeedShellProps) {
  return (
    <div className={cn('flex w-full flex-col items-center gap-6 px-4 py-6 sm:px-6', className)}>
      <div className="flex w-full max-w-[470px] justify-center">
        <PlatformToggle platform={platform} onChange={onPlatformChange} />
      </div>
      <div className="flex w-full max-w-[470px] flex-col gap-6">
        {children}
      </div>
    </div>
  )
}
