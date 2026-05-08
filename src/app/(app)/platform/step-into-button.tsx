'use client'

import { useTransition } from 'react'
import { useOrganizationList } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

/**
 * Steps a platform owner into a target agency by setting Clerk's active
 * organization. The platformOwner badge on the user means they don't need
 * a Clerk membership in this org to access it — but Clerk's setActive
 * still expects an org the user can switch to. If Clerk rejects the
 * switch (no Clerk membership), we fall back to navigating to /dashboard
 * with the URL as a hint; getOrgContext's Membership-fallback path will
 * resolve the active org correctly.
 */
export function StepIntoAgencyButton({
  clerkOrgId,
}: {
  clerkOrgId: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const { setActive, isLoaded } = useOrganizationList()

  const onClick = () => {
    if (!isLoaded || !setActive) return
    startTransition(async () => {
      try {
        await setActive({ organization: clerkOrgId })
      } catch {
        // Clerk rejected (no membership). Platform-owner badge still
        // grants access via the DB-based fallback in getOrgContext.
      }
      router.push('/dashboard')
    })
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={isPending}>
      {isPending ? 'Stepping in...' : 'Step in'}
    </Button>
  )
}
