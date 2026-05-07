'use client'

import { useState, useCallback, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { LayoutDashboard, Users, Settings, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Clients', href: '/clients', icon: Users },
  { label: 'Settings', href: '/settings/org', icon: Settings },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

  useEffect(() => {
    closeSidebar()
  }, [pathname, closeSidebar])

  return (
    <div className="flex h-dvh flex-col md:flex-row bg-background">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink/40 md:hidden"
          onClick={closeSidebar}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-cream-warm transition-transform duration-200 md:static md:z-auto md:w-60 md:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Link href="/dashboard" className="flex items-center" aria-label="Relay home">
            <Image
              src="/brand/logo-no-padding-dark-text.svg"
              alt="Relay"
              width={96}
              height={28}
              priority
              className="h-7 w-auto"
            />
          </Link>
          <button
            onClick={closeSidebar}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-cream-80 md:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-full px-3 py-2.5 text-[14px] font-medium transition-colors',
                  isActive
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-ink-50 hover:bg-cream-80 hover:text-foreground'
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0', isActive && 'text-orange')} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="px-5 py-4 flex items-center gap-3">
          <UserButton />
          <span className="text-[12px] text-muted-foreground italic" style={{ fontFamily: 'var(--font-serif)' }}>
            beta
          </span>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 bg-cream-warm px-4 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-cream-80"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Image
            src="/brand/logo-no-padding-dark-text.svg"
            alt="Relay"
            width={80}
            height={24}
            priority
            className="h-6 w-auto"
          />
        </header>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
