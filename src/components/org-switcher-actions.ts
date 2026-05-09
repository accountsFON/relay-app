'use server'

import { cookies } from 'next/headers'
import { STEP_INTO_COOKIE } from '@/server/middleware/auth'

/**
 * Sets the platform-owner step-into cookie. Read by getOrgContext to
 * override Clerk's active-org lookup, enabling step-into for orgs the
 * platform owner doesn't have Clerk-side membership in OR when Clerk's
 * setActive silently fails (rate limit, stale session). HttpOnly so
 * client JS can't tamper.
 */
export async function setStepIntoOrgCookie(dbOrgId: string) {
  const cookieStore = await cookies()
  cookieStore.set(STEP_INTO_COOKIE, dbOrgId, {
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
    sameSite: 'lax',
    httpOnly: true,
  })
}
