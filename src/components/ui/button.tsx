import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-ink-80 hover:bg-ink-80",
        accent: "bg-foreground text-cream [a]:hover:bg-ink-80 hover:bg-ink-80",
        outline:
          "border-border bg-card text-foreground hover:bg-cream-warm hover:text-foreground aria-expanded:bg-cream-warm aria-expanded:text-foreground",
        // Brand refresh 2.5C.1: secondary now matches outline (white pill with border).
        // Old cream fill chip pattern moved to dedicated chip primitive in 2.5C.2.
        secondary:
          "border-border bg-card text-foreground hover:bg-cream-warm hover:text-foreground aria-expanded:bg-cream-warm aria-expanded:text-foreground",
        ghost:
          "hover:bg-cream-warm hover:text-foreground aria-expanded:bg-cream-warm aria-expanded:text-foreground",
        // Brand v1 has no dedicated destructive red. Coral is the closest warm
        // accent. Flagged for Caleb review (Phase 2.5C.1).
        destructive:
          "bg-coral-500 text-white hover:bg-coral-500/90 focus-visible:border-coral-500/40 focus-visible:ring-coral-500/20",
        link: "text-foreground underline-offset-4 hover:underline rounded-none",
      },
      size: {
        // Brand refresh 2.5C.1: bumped horizontal padding across sizes so pills
        // don't look thin/squished. Icon variants stay square.
        default: "h-10 gap-1.5 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        xs: "h-7 gap-1 px-3 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 px-4 text-[13px] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-1.5 px-7 text-[15px] has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5",
        icon: "size-10",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
