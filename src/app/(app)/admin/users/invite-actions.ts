'use server'

import { clerkClient } from '@clerk/nextjs/server'
import { isClerkAPIResponseError } from '@clerk/shared/error'
import { revalidatePath } from 'next/cache'
import { requireAdminPortal } from '@/server/middleware/permissions'
import type { UserRole } from '@/lib/types'

export type InviteMemberResult = { ok: true } | { ok: false; error: string }

/**
 * Sends a Clerk org invitation. Two things ride along:
 *   1. Clerk's binary role key (org:admin / org:member) for Clerk's own
 *      org-admin flag (admin -> org:admin so they get Clerk-native powers).
 *   2. The exact DB UserRole on the invitation's publicMetadata (`relayRole`).
 *      Clerk's binary role cannot express our four roles, so onboarding's
 *      Path 2 reads `relayRole` back to set the real Membership role. Without
 *      this, every invited user collapsed to org:member and onboarding could
 *      not recover the chosen role (it defaulted them all to admin).
 *
 * Returns a result object rather than throwing on an expected failure
 * (Clerk rejecting the invite: membership quota reached, duplicate
 * invitation, invalid email, etc.). A THROWN error from a server action is
 * replaced with an opaque "An error occurred in the Server Components
 * render" digest in production, so the caller could never show the real
 * reason. A RETURNED value passes through intact, so the modal can render
 * Clerk's own explanation (e.g. "You have reached your limit of 5
 * organization memberships"). Unexpected non-Clerk errors still throw.
 */
export async function inviteMember(input: {
  email: string
  role: UserRole
}): Promise<InviteMemberResult> {
  const ctx = await requireAdminPortal()

  const email = input.email.trim().toLowerCase()
  if (!email) return { ok: false, error: 'Email is required' }

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
  try {
    await clerk.organizations.createOrganizationInvitation({
      organizationId: ctx.orgId,
      inviterUserId: ctx.userId,
      emailAddress: email,
      // The real role, read back by onboarding Path 2 to set Membership.role.
      role: clerkRole,
      publicMetadata: { relayRole: input.role },
      redirectUrl: `${appUrl}/sign-up`,
    })
  } catch (err) {
    if (isClerkAPIResponseError(err)) {
      const first = err.errors?.[0]
      return {
        ok: false,
        error:
          first?.longMessage ??
          first?.message ??
          'Could not send the invite. Please try again.',
      }
    }
    // Unexpected (network, Clerk SDK bug, etc.) — let it bubble to the
    // nearest error boundary so it is logged, not silently swallowed.
    throw err
  }

  revalidatePath('/admin/users')
  return { ok: true }
}
