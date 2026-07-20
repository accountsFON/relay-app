/**
 * POST /api/onboarding/reset
 *
 * Body: none.
 *
 * Auth: any authenticated app user (Clerk session resolved to a DB
 * User row via getOrgContext). Returns 401 if there is no session.
 *
 * Fires when the user taps "Restart guided tour" in /settings/org.
 * Clears User.onboardingTourSeenAt, User.launchPadDismissedAt, and the
 * User.seenTours coachmark list so the (app) layout redirects to /welcome
 * on the next request and BOTH the overview tour and the page coachmark
 * tours can auto fire again.
 *
 * Phase 4 item 25. See
 * projects/relay-app/2026-06-01-phase-4-design-brief.md § Item 25.
 */
import { NextResponse } from 'next/server'
import { getOrgContext } from '@/server/middleware/auth'
import { resetTour } from '@/server/services/onboardingTour'

export async function POST() {
  const ctx = await getOrgContext()
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await resetTour(ctx.userDbId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[onboarding/reset] failed', err)
    return NextResponse.json(
      { error: 'Failed to reset onboarding tour' },
      { status: 500 },
    )
  }
}
