'use client'

import { useState, useTransition } from 'react'
import { useOrganizationList } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Globe2, Check, ChevronDown } from 'lucide-react'
import { setStepIntoOrgCookie } from './org-switcher-actions'

export type AgencyOption = {
  id: string
  name: string
  clerkOrgId: string
}

type Props = {
  /** Number of Memberships this user has. */
  membershipCount: number
  platformOwner: boolean
  /** Display name for the active agency. */
  activeAgencyName: string
  /**
   * Full list of every Organization on the platform. Only passed when
   * the user is a platform owner; drives a custom dropdown that lets
   * them switch into ANY agency, not just Clerk memberships.
   */
  allAgencies?: AgencyOption[]
  /**
   * The user's own Memberships, mapped to AgencyOption. Used for
   * multi-membership regular users so we can render a dropdown without
   * Clerk's <OrganizationSwitcher> (which exposes a "Create organization"
   * button — agency creation is gated to Path 1 + platform owners).
   */
  userAgencies?: AgencyOption[]
  /** Active org's Clerk Org ID, used to mark the current row in the dropdown. */
  activeClerkOrgId?: string
}

export function OrgSwitcher({
  membershipCount,
  platformOwner,
  activeAgencyName,
  allAgencies,
  userAgencies,
  activeClerkOrgId,
}: Props) {
  // Single-membership, non-platform-owner: no dropdown.
  if (!platformOwner && membershipCount <= 1) {
    return (
      <div className="px-3 py-2 text-sm font-medium text-foreground">
        {activeAgencyName}
      </div>
    )
  }

  // Platform owners get the platform wide list; regular multi-membership
  // users get their own Memberships. Either way the dropdown sits above the
  // platform owner pin link below.
  const dropdownAgencies = platformOwner ? allAgencies : userAgencies

  return (
    <div className="px-3 py-2 space-y-2">
      {dropdownAgencies && dropdownAgencies.length > 0 ? (
        <AgencyDropdown
          agencies={dropdownAgencies}
          activeClerkOrgId={activeClerkOrgId}
          activeAgencyName={activeAgencyName}
        />
      ) : (
        <div className="text-sm font-medium text-foreground">
          {activeAgencyName}
        </div>
      )}
      {/* Platform owners always see this pin even if allAgencies came back
          empty. Pinning by `platformOwner` alone (rather than the previous
          `platformOwner && allAgencies.length > 0` guard) prevents the
          affordance from disappearing on routes that happen to short circuit
          the org load. */}
      {platformOwner && (
        <Link
          href="/platform"
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Globe2 className="h-3.5 w-3.5" />
          Manage all agencies
        </Link>
      )}
    </div>
  )
}

function AgencyDropdown({
  agencies,
  activeClerkOrgId,
  activeAgencyName,
}: {
  agencies: AgencyOption[]
  activeClerkOrgId?: string
  activeAgencyName: string
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const { setActive, isLoaded } = useOrganizationList()

  const stepInto = (clerkOrgId: string, dbOrgId: string) => {
    if (!isLoaded || !setActive) return
    setOpen(false)

    startTransition(async () => {
      // Persist the platform-owner choice via HttpOnly cookie. getOrgContext
      // reads it to override Clerk's active-org lookup, enabling step-into
      // for orgs the user doesn't have Clerk-side membership in OR when
      // Clerk's setActive silently fails. Regular users have a Clerk
      // membership in every agency in their dropdown, so the cookie is
      // essentially a no-op for them.
      await setStepIntoOrgCookie(dbOrgId)
      try {
        await setActive({ organization: clerkOrgId })
      } catch {
        // Clerk rejects when the user has no Clerk membership in this org.
        // For platform owners this is expected — the cookie above carries
        // the choice through. For regular users it shouldn't happen since
        // we only show their own memberships.
      }
      router.refresh()
    })
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className="w-full flex items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-muted/40"
      >
        <span className="truncate font-medium">
          {isPending ? 'Switching...' : activeAgencyName}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-card shadow-lg max-h-80 overflow-y-auto">
            {agencies.map((agency) => {
              const isActive = agency.clerkOrgId === activeClerkOrgId
              return (
                <button
                  type="button"
                  key={agency.id}
                  onClick={() => stepInto(agency.clerkOrgId, agency.id)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/40"
                >
                  <span className="truncate">{agency.name}</span>
                  {isActive && (
                    <Check className="h-4 w-4 shrink-0 text-foreground" />
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
