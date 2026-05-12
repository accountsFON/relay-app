'use client'

import { useState, useCallback, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { LayoutDashboard, Users, Settings, Menu, ShieldCheck, Globe2, X, Inbox, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { OrgSwitcher, type AgencyOption } from '@/components/org-switcher'
import { DateScopePill } from '@/components/date-scope-pill'
import { SearchBar } from '@/components/search-bar'
import { MobileSearchSheet } from '@/components/search/mobile-search-sheet'

type BadgeKey = 'unreadMentions'
type NavItem = {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badgeKey?: BadgeKey
}
const baseNavItems: NavItem[] = [
  { label: 'My Relay', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Clients', href: '/clients', icon: Users },
  { label: 'Inbox', href: '/inbox', icon: Inbox, badgeKey: 'unreadMentions' },
]
const settingsNavItem: NavItem = {
  label: 'Settings',
  href: '/settings/org',
  icon: Settings,
}
const adminNavItem: NavItem = {
  label: 'Admin',
  href: '/admin',
  icon: ShieldCheck,
}
const platformNavItem: NavItem = {
  label: 'Platform',
  href: '/platform',
  icon: Globe2,
}
/** Beta QA index — temporary surface, drop after the beta cycle. */
const libraryNavItem: NavItem = {
  label: 'Library',
  href: '/library',
  icon: BookOpen,
}

export function AppShell({
  children,
  showAdmin = false,
  platformOwner = false,
  showLibrary = false,
  membershipCount = 1,
  activeAgencyName = '',
  allAgencies,
  userAgencies,
  activeClerkOrgId,
  unreadMentions = 0,
}: {
  children: React.ReactNode
  showAdmin?: boolean
  platformOwner?: boolean
  showLibrary?: boolean
  membershipCount?: number
  activeAgencyName?: string
  allAgencies?: AgencyOption[]
  userAgencies?: AgencyOption[]
  activeClerkOrgId?: string
  unreadMentions?: number
}) {
  const navItems = [
    ...baseNavItems,
    ...(showAdmin ? [adminNavItem] : []),
    ...(platformOwner ? [platformNavItem] : []),
    ...(showLibrary ? [libraryNavItem] : []),
  ]
  const badgeMap: Record<BadgeKey, number> = {
    unreadMentions: unreadMentions,
  }
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
          <Link href="/dashboard" className="flex items-center pl-1" aria-label="Relay home">
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

        <OrgSwitcher
          membershipCount={membershipCount}
          platformOwner={platformOwner}
          activeAgencyName={activeAgencyName}
          allAgencies={allAgencies}
          userAgencies={userAgencies}
          activeClerkOrgId={activeClerkOrgId}
        />

        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname.startsWith(item.href)
            const badgeCount = item.badgeKey ? badgeMap[item.badgeKey] : 0
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
                <Icon className={cn('h-4 w-4 shrink-0', isActive && 'text-foreground')} />
                <span className="flex-1">{item.label}</span>
                {badgeCount > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-[11px] font-medium text-background">
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="px-3 pb-2 pt-1">
          {(() => {
            const Icon = settingsNavItem.icon
            const isActive = pathname.startsWith(settingsNavItem.href)
            return (
              <Link
                href={settingsNavItem.href}
                className={cn(
                  'flex items-center gap-3 rounded-full px-3 py-2.5 text-[14px] font-medium transition-colors',
                  isActive
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-ink-50 hover:bg-cream-80 hover:text-foreground'
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0', isActive && 'text-foreground')} />
                {settingsNavItem.label}
              </Link>
            )
          })()}
        </div>

        <div className="px-5 py-4 flex items-center gap-3 border-t border-cream-80">
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
          <div className="ml-auto flex items-center gap-2">
            <MobileSearchSheet />
            <DateScopePill />
          </div>
        </header>

        <header className="hidden h-12 shrink-0 items-center justify-end gap-3 border-b border-cream-80 bg-cream-warm/40 px-6 md:flex">
          <SearchBar />
          <DateScopePill />
        </header>

        {/* tabindex="0" makes the scrollable main region keyboard navigable
            (axe scrollable-region-focusable rule, surfaced by the audit on
            /settings/org but applies on every route). Keyboard users can
            now focus the scroll container and arrow / page keys move it. */}
        <main tabIndex={0} className="flex-1 overflow-y-auto focus:outline-none">
          {children}
        </main>
      </div>
    </div>
  )
}
