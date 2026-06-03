'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { label: 'Agency', href: '/settings/org' },
  { label: 'Account', href: '/settings/account' },
]

/** Sub navigation for the settings surfaces. Agency = org level config,
 *  Account = personal account settings (incl. the close account danger zone). */
export function SettingsTabs() {
  const pathname = usePathname()
  return (
    <nav className="flex gap-1 border-b border-border px-6 pt-6 md:px-12">
      {TABS.map((t) => {
        const isActive = pathname.startsWith(t.href)
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'rounded-t-md px-3 py-2 text-sm',
              isActive
                ? 'border-b-2 border-foreground font-medium text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}

export default SettingsTabs
