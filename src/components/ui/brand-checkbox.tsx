import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Brand-painted native checkbox. Uses `accent-foreground` so the checked
 * box fills with neutral-900 and the check glyph stays the platform default
 * (no SVG hack). Standardizes size, border, focus ring, and disabled state
 * across surfaces, matches the spec from 2.5C.3 Step 3.
 *
 * Drop-in replacement for `<input type="checkbox" ... />`.
 */
export type BrandCheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>

export const BrandCheckbox = React.forwardRef<HTMLInputElement, BrandCheckboxProps>(
  function BrandCheckbox({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        type="checkbox"
        className={cn(
          'size-4 shrink-0 cursor-pointer rounded border border-neutral-300 accent-neutral-900',
          'transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100 focus-visible:border-neutral-900',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    )
  },
)
