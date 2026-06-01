'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { requireAdminPortal } from '@/server/middleware/permissions'
import type { UserRole } from '@/lib/types'

/**
 * Sends a Clerk org invitation. Maps our DB UserRole down to Clerk's two
 * built-in role keys (org:admin / org:member). Fine-grained permissions
 * live on the Membership row created by onboarding's Path 2; Clerk only
 * tracks the binary admin/member flag.
 */
export async function inviteMember(input: {
  email: string
  role: UserRole
}) {
  const ctx = await requireAdminPortal()

  const email = input.email.trim().toLowerCase()
  if (!email) throw new Error('Email is required')

  const clerkRole = input.role === 'admin' ? 'org:admin' : 'org:member'

  // Build an absolute redirect URL so the invitation email links land on
  // OUR /sign-up page (which handles __clerk_ticket and routes to onboarding
  // Path 2) instead of Clerk's hosted UI.
  //
  // Prefer VERCEL_PROJECT_PRODUCTION_URL (the friendly prod alias, e.g.
  // relay-app-xi.vercel.app, publicly accessible) over VERCEL_URL (the
  // per-deployment URL like relay-71xmnxl3x-...vercel.app, which is gated
  // by Vercel SSO on Hobby plans). Local dev falls back to localhost.
  // Set NEXT_PUBLIC_APP_URL when a real custom domain is wired up.
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null) ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  const clerk = await clerkClient()
  await clerk.organizations.createOrganizationInvitation({
    organizationId: ctx.orgId,
    inviterUserId: ctx.userId,
    emailAddress: email,
    role: clerkRole,
    redirectUrl: `${appUrl}/sign-up`,
  })

  revalidatePath('/admin/users')
  return { ok: true }
}
