import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HeroDecoration } from '@/components/decorations/hero-decoration'

type BreadcrumbItem = { label: string; href?: string }

export type HeroBandProps = {
  title: string
  subtitle?: string
  breadcrumb?: BreadcrumbItem[]
  className?: string
}

export function HeroBand({ title, subtitle, breadcrumb, className }: HeroBandProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-3xl bg-blue-100 px-8 py-6 md:px-10 md:py-7',
        'flex items-center gap-6',
        className,
      )}
    >
      <div className="relative z-10 min-w-0 flex-1">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-sm text-neutral-700">
            {breadcrumb.map((item, idx) => (
              <span key={idx} className="flex items-center gap-1">
                {item.href ? (
                  <Link href={item.href} className="hover:underline">{item.label}</Link>
                ) : (
                  <span className="font-medium text-neutral-900">{item.label}</span>
                )}
                {idx < breadcrumb.length - 1 && <ChevronRight className="w-3.5 h-3.5 opacity-60" />}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-neutral-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm md:text-base text-neutral-700">{subtitle}</p>}
      </div>
      <div className="relative z-0 hidden shrink-0 md:block">
        <HeroDecoration />
      </div>
    </div>
  )
}
