'use client'

import { useState, useCallback, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { LayoutDashboard, Users, Settings, Menu, ShieldCheck, Globe2, X, Inbox, BookOpen, Archive } from 'lucide-react'
import { cn } from '@/lib/utils'
import { OrgSwitcher, type AgencyOption } from '@/components/org-switcher'
import { DateScopePill } from '@/components/date-scope-pill'
import { SearchBar } from '@/components/search-bar'
import { MobileSearchSheet } from '@/components/search/mobile-search-sheet'
import { InFlightRunsProvider } from '@/components/relay/in-flight-runs-provider'
import { InFlightRunsPill } from '@/components/relay/in-flight-runs-pill'
import { InFlightAutoFinalizer } from '@/components/relay/in-flight-auto-finalizer'
import { CompletionNotificationsProvider, CompletionNotificationsBanner } from '@/components/relay/completion-notifications'
import { NotificationProvider } from '@/components/notifications/notification-provider'
import { HeaderBell } from '@/components/notifications/header-bell'
import { NotificationDropdown } from '@/components/notifications/notification-dropdown'
import { DecorationCorner } from '@/components/decorations/decoration-corner'
import { TourProvider } from '@/components/onboarding/tour-provider'
import type { UserRole } from '@/lib/types'
import { ReportBugButton } from '@/components/feedback/report-bug-button'
import { Toaster } from 'sonner'

type BadgeKey = 'unreadMentions'
type NavItem = {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badgeKey?: BadgeKey
  /**
   * Optional data-tour-anchor attribute value. The onboarding tour
   * positions its popovers by `[data-tour-anchor="..."]` selectors;
   * do not rename or drop these without updating
   * src/components/onboarding/tour-provider.tsx DEFAULT_TOUR_STOPS
   * and the matching Playwright spec.
   */
  tourAnchor?: string
}
const baseNavItems: NavItem[] = [
  { label: 'My Relay', href: '/dashboard', icon: LayoutDashboard, tourAnchor: 'my-relay' },
  { label: 'Clients', href: '/clients', icon: Users, tourAnchor: 'clients' },
  { label: 'Inbox', href: '/inbox', icon: Inbox, badgeKey: 'unreadMentions', tourAnchor: 'inbox' },
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
/** Beta QA index, temporary surface, drop after the beta cycle. */
const libraryNavItem: NavItem = {
  label: 'Library',
  href: '/library',
  icon: BookOpen,
}
const archiveNavItem: NavItem = {
  label: 'Archive',
  href: '/archive',
  icon: Archive,
}

export function AppShell({
  children,
  showAdmin = false,
  showArchive = false,
  platformOwner = false,
  showLibrary = false,
  membershipCount = 1,
  activeAgencyName = '',
  allAgencies,
  userAgencies,
  activeClerkOrgId,
  unreadMentions = 0,
  role,
  seenTours,
}: {
  children: React.ReactNode
  showAdmin?: boolean
  showArchive?: boolean
  platformOwner?: boolean
  showLibrary?: boolean
  membershipCount?: number
  activeAgencyName?: string
  allAgencies?: AgencyOption[]
  userAgencies?: AgencyOption[]
  activeClerkOrgId?: string
  unreadMentions?: number
  role: UserRole
  seenTours: string[]
}) {
  const navItems = [
    ...baseNavItems,
    ...(showArchive ? [archiveNavItem] : []),
    ...(showAdmin ? [adminNavItem] : []),
    ...(platformOwner ? [platformNavItem] : []),
    ...(showLibrary ? [libraryNavItem] : []),
  ]
  const badgeMap: Record<BadgeKey, number> = {
    unreadMentions: unreadMentions,
  }
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Separate from sidebarOpen: the tour drives this when it goes active
  // on mobile so the nav drawer slides in behind the popover. Kept
  // separate so the pathname-change auto-close (which only mutates
  // sidebarOpen) never fights the tour. The aside visibility is derived
  // from the OR of the two below.
  const [tourNavOpen, setTourNavOpen] = useState(false)
  const pathname = usePathname()

  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

  useEffect(() => {
    closeSidebar()
  }, [pathname, closeSidebar])

  return (
    <InFlightRunsProvider>
    <NotificationProvider>
    <CompletionNotificationsProvider>
    <TourProvider role={role} seenTours={seenTours} onTourNavChange={setTourNavOpen}>
    <div className="flex h-dvh flex-col md:flex-row bg-neutral-50">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-neutral-900/40 md:hidden"
          onClick={closeSidebar}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-white transition-transform duration-200',
          'md:static md:z-auto md:w-60 md:translate-x-0 md:m-3 md:rounded-3xl md:shadow-sm md:border md:border-neutral-200/60',
          (sidebarOpen || tourNavOpen) ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Link href="/dashboard" className="flex items-center pl-1" aria-label="Relay home">
            <Image
              src="/brand/wordmark-dark.svg"
              alt="Relay"
              width={72}
              height={36}
              priority
              className="h-9 w-auto"
            />
          </Link>
          <button
            onClick={closeSidebar}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-neutral-200 md:hidden"
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
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              isActive={pathname.startsWith(item.href)}
              badgeCount={item.badgeKey ? badgeMap[item.badgeKey] : 0}
              dataTourAnchor={item.tourAnchor}
            />
          ))}
        </nav>

        <div className="px-3 pb-2 pt-1">
          <NavLink
            href={settingsNavItem.href}
            label={settingsNavItem.label}
            icon={settingsNavItem.icon}
            isActive={pathname.startsWith('/settings')}
          />
        </div>

        <div className="px-3 pb-1 pt-1">
          {/* Persistent in app feedback channel, Phase 5 item 27. Sits
              just above the user row so it stays visible on every page
              without competing with the primary nav for attention. */}
          <ReportBugButton />
        </div>

        <div className="px-5 py-4 flex items-center gap-3 border-t border-neutral-200">
          <UserButton />
          <span className="text-[12px] text-muted-foreground italic" style={{ fontFamily: 'var(--font-serif)' }}>
            beta
          </span>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 bg-neutral-100 px-4 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-neutral-200"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Image
            src="/brand/wordmark-dark.svg"
            alt="Relay"
            width={64}
            height={32}
            priority
            className="h-8 w-auto"
          />
          <div className="ml-auto flex items-center gap-2">
            <MobileSearchSheet />
            <DateScopePill />
            <div className="relative">
              <HeaderBell mountId="mobile" />
              <NotificationDropdown mountId="mobile" />
            </div>
          </div>
        </header>

        <header className="hidden h-12 shrink-0 items-center justify-end gap-3 border-b border-neutral-200 bg-neutral-100/40 px-6 md:flex">
          <SearchBar />
          <InFlightRunsPill />
          <DateScopePill />
          <div className="relative">
            <HeaderBell mountId="desktop" />
            <NotificationDropdown mountId="desktop" />
          </div>
        </header>

        {/* tabindex="0" makes the scrollable main region keyboard navigable
            (axe scrollable-region-focusable rule, surfaced by the audit on
            /settings/org but applies on every route). Keyboard users can
            now focus the scroll container and arrow / page keys move it. */}
        <main tabIndex={0} className="flex-1 overflow-y-auto focus:outline-none">
          {children}
        </main>
      </div>
      <DecorationCorner />
    </div>
    <InFlightAutoFinalizer />
    <CompletionNotificationsBanner />
    <Toaster
      position="bottom-right"
      richColors
      closeButton
      theme="light"
      toastOptions={{
        classNames: {
          success: 'border-blue-500',
          error: 'border-coral-500',
          info: 'border-neutral-700',
        },
      }}
    />
    </TourProvider>
    </CompletionNotificationsProvider>
    </NotificationProvider>
    </InFlightRunsProvider>
  )
}

/**
 * Shared sidebar nav link. Renders both the main nav loop and the
 * Settings link below it, so the active state styling and icon
 * colouring stay aligned between the two. Optional `badgeCount`
 * shows the unread pill (main nav only); optional `dataTourAnchor`
 * threads through onboarding tour selectors (see TourProvider
 * DEFAULT_TOUR_STOPS).
 */
function NavLink({
  href,
  label,
  icon: Icon,
  isActive,
  badgeCount = 0,
  dataTourAnchor,
}: {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  isActive: boolean
  badgeCount?: number
  dataTourAnchor?: string
}) {
  return (
    <Link
      href={href}
      data-tour-anchor={dataTourAnchor}
      className={cn(
        'flex items-center gap-3 rounded-full px-3 py-2.5 text-[14px] font-medium transition-colors',
        isActive
          ? 'bg-blue-100 text-neutral-900'
          : 'text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900'
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-blue-500' : 'text-neutral-500')} />
      <span className="flex-1">{label}</span>
      {badgeCount > 0 && (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-coral-500 px-1.5 text-[11px] font-medium text-white">
          {badgeCount > 99 ? '99+' : badgeCount}
        </span>
      )}
    </Link>
  )
}
