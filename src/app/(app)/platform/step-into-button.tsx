'use client'

import { useTransition } from 'react'
import { useOrganizationList } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { setStepIntoOrgCookie } from '@/components/org-switcher-actions'

/**
 * Steps a platform owner into a target agency.
 *
 * Persists the choice via the HttpOnly STEP_INTO_COOKIE that
 * getOrgContext reads with priority over Clerk's active org. Then
 * best-effort calls Clerk's setActive so the Clerk session also tracks
 * the new org. Without the cookie persist, the platformOwner badge
 * alone wasn't enough: Clerk's session held the prior active org and
 * getOrgContext fell through to that, leaving the sidebar + data
 * stuck in the previous agency. Match the OrgSwitcher pattern.
 */
export function StepIntoAgencyButton({
  clerkOrgId,
  dbOrgId,
}: {
  clerkOrgId: string
  dbOrgId: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const { setActive, isLoaded } = useOrganizationList()

  const onClick = () => {
    if (!isLoaded || !setActive) return
    startTransition(async () => {
      await setStepIntoOrgCookie(dbOrgId)
      try {
        await setActive({ organization: clerkOrgId })
      } catch {
        // Clerk rejected (no Clerk-side membership). The cookie above
        // already persists the choice and getOrgContext picks it up.
      }
      router.push('/dashboard')
      router.refresh()
    })
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={isPending}>
      {isPending ? 'Stepping in...' : 'Step in'}
    </Button>
  )
}
