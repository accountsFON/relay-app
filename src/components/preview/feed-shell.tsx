'use client'

import { cn } from '@/lib/utils'
import { SocialPreviewHeading } from './social-preview-heading'

export type FeedShellProps = {
  children: React.ReactNode
  className?: string
}

/**
 * Single-column scroll wrapper that hosts a list of preview feed posts.
 * Renders the "Social Preview" heading pinned to the top, then children
 * stacked below in a column whose max width matches the feed (~470px).
 *
 * Previews are Facebook-only; the Instagram/Facebook PlatformToggle that used
 * to sit here was retired (Instagram chrome left dormant — see
 * platform-toggle.tsx). Restore the toggle here to re-enable platform switching.
 *
 * Mobile: full width below sm breakpoint, with horizontal padding so
 * cards don't kiss the screen edge.
 */
export function FeedShell({ children, className }: FeedShellProps) {
  return (
    <div className={cn('flex w-full flex-col items-center gap-6 px-4 py-6 sm:px-6', className)}>
      <div className="flex w-full max-w-[470px] justify-center">
        <SocialPreviewHeading />
      </div>
      <div className="flex w-full max-w-[470px] flex-col gap-6">
        {children}
      </div>
    </div>
  )
}
