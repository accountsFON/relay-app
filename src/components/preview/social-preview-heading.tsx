import { cn } from '@/lib/utils'

export type SocialPreviewHeadingProps = {
  className?: string
}

/**
 * Small muted "Social Preview" label that sits above the feed, in the spot
 * the Instagram/Facebook PlatformToggle used to occupy. The toggle was retired
 * when previews went Facebook-only; the Instagram chrome is left dormant (see
 * platform-toggle.tsx + instagram-post.tsx). Restore the PlatformToggle here to
 * re-enable platform switching.
 */
export function SocialPreviewHeading({ className }: SocialPreviewHeadingProps) {
  return (
    <h2
      className={cn(
        'text-[13px] font-medium text-neutral-500',
        className,
      )}
    >
      Social Preview
    </h2>
  )
}
