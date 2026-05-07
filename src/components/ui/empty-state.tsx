import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * EmptyState — confident empty state pattern (Wise/Anthropic-style).
 * Italic Georgia display headline + one sentence + one orange pill CTA.
 * No "try one of these examples" walls.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-20 text-center',
        className
      )}
    >
      <h2
        className="text-3xl sm:text-4xl font-normal italic text-foreground"
        style={{ fontFamily: 'var(--font-serif)', letterSpacing: '-0.5px', lineHeight: 1.1 }}
      >
        {title}
      </h2>
      {description && (
        <p className="mt-4 max-w-md text-[15px] text-muted-foreground leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-8">{action}</div>}
    </div>
  )
}
