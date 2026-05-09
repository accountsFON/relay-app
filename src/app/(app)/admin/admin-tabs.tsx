'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/users', label: 'Team' },
  { href: '/admin/clients', label: 'Clients' },
  { href: '/admin/roles', label: 'Role defaults' },
]

/**
 * Pill nav for the admin section. Highlights the most-specific match so
 * /admin/users/[id] keeps "Team" active while drilled in.
 */
export function AdminTabs() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-wrap gap-1.5" aria-label="Admin sections">
      {TABS.map((tab) => {
        const active =
          tab.href === '/admin'
            ? pathname === '/admin'
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'inline-flex items-center rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors',
              active
                ? 'bg-foreground text-background'
                : 'bg-cream-warm text-ink-50 hover:bg-cream-80 hover:text-foreground',
            )}
            aria-current={active ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
