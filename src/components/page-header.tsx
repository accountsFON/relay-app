import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * PageHeader — Wise-style page title block.
 * Optional circular back button above the title, big title, supporting copy.
 * Action bar (chip row) sits in its own row below for reliable wrapping.
 */
export function PageHeader({
  title,
  description,
  backHref,
  backLabel,
  actions,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  backHref?: string
  backLabel?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-5', className)}>
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex items-center justify-center size-10 rounded-full bg-cream-warm text-foreground transition-colors hover:bg-cream-80"
          aria-label={backLabel ?? 'Back'}
        >
          <ArrowLeft className="size-4" />
        </Link>
      )}
      <div className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground tracking-[-0.5px] leading-tight">
          {title}
        </h1>
        {description && (
          <p className="text-[15px] text-muted-foreground max-w-2xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
