import { db } from '@/db/client'
import type { Plan } from '@/lib/types'

export async function findOrgByClerkId(clerkOrgId: string) {
  return db.organization.findUnique({
    where: { clerkOrgId },
  })
}

export async function createOrganization(input: {
  clerkOrgId: string
  name: string
  plan: Plan
}) {
  return db.organization.create({
    data: {
      clerkOrgId: input.clerkOrgId,
      name: input.name,
      plan: input.plan,
    },
  })
}

/** Default fallback when an org row is somehow missing the setting. */
export const DEFAULT_REVIEW_WINDOW_DAYS = 7

/**
 * The agency review window (days) for an org — seeds the review-link default
 * expiry in the send-link modal (P2 #23). Falls back to the default if the org
 * is missing (defensive; the caller is always org-scoped).
 */
export async function getReviewWindowDays(organizationId: string): Promise<number> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { reviewWindowDays: true },
  })
  return org?.reviewWindowDays ?? DEFAULT_REVIEW_WINDOW_DAYS
}
