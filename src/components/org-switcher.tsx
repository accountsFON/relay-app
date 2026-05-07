'use client'

import { OrganizationSwitcher } from '@clerk/nextjs'
import Link from 'next/link'
import { Globe2 } from 'lucide-react'

type Props = {
  /** Number of Memberships this user has. Drives the show/hide decision. */
  membershipCount: number
  platformOwner: boolean
  /** Display name for the active agency, used when switcher is hidden. */
  activeAgencyName: string
}

export function OrgSwitcher({
  membershipCount,
  platformOwner,
  activeAgencyName,
}: Props) {
  // Single-membership, non-platform-owner users see no switcher.
  // Just the agency name as a static label.
  if (!platformOwner && membershipCount <= 1) {
    return (
      <div className="px-3 py-2 text-sm font-medium text-foreground">
        {activeAgencyName}
      </div>
    )
  }

  return (
    <div className="px-3 py-2 space-y-2">
      <OrganizationSwitcher
        appearance={{
          elements: {
            rootBox: 'w-full',
            organizationSwitcherTrigger: 'w-full justify-between',
          },
        }}
      />
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
