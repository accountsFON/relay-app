import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.06em] whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-neutral-100 text-foreground",
        primary: "bg-primary text-primary-foreground",
        accent: "bg-foreground text-neutral-50",
        secondary: "bg-neutral-200 text-neutral-700",
        success: "bg-neutral-100 text-foreground",
        warning: "bg-neutral-100 text-foreground",
        destructive: "bg-destructive/10 text-destructive",
        outline: "border-border text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

/**
 * StatusDot: small colored dot for inline status indication.
 * Wise-style: a single dot signals state without dominating the row.
 */
function StatusDot({
  status,
  className,
}: {
  status?: 'active' | 'running' | 'queued' | 'complete' | 'failed' | 'inactive' | string
  className?: string
}) {
  const color = {
    active: 'bg-foreground',
    running: 'bg-foreground animate-pulse',
    queued: 'bg-neutral-500',
    complete: 'bg-foreground',
    failed: 'bg-destructive',
    inactive: 'bg-neutral-300',
  }[status ?? 'inactive'] ?? 'bg-neutral-300'

  return (
    <span
      className={cn('inline-block size-1.5 rounded-full shrink-0', color, className)}
      aria-hidden="true"
    />
  )
}

export { Badge, badgeVariants, StatusDot }
