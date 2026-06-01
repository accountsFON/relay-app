/**
 * POST /api/onboarding/tour-seen
 *
 * Body: none.
 *
 * Auth: any authenticated app user (Clerk session resolved to a DB
 * User row via getOrgContext). Returns 401 if there is no session.
 *
 * Fires when the user finishes step 3, hits ESC on any step, or hits
 * the Skip button. Sets User.onboardingTourSeenAt = now() and also
 * stamps launchPadDismissedAt so the (app) layout redirect predicate
 * (both null) can never re fire after a completed tour.
 *
 * Idempotent: a second POST after the columns are set just bumps the
 * timestamps.
 *
 * Phase 4 item 25. See
 * projects/relay-app/2026-06-01-phase-4-design-brief.md § Item 25.
 */
import { NextResponse } from 'next/server'
import { getOrgContext } from '@/server/middleware/auth'
import { markTourSeen } from '@/server/services/onboardingTour'

export async function POST() {
  const ctx = await getOrgContext()
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await markTourSeen(ctx.userDbId)
    return NextResponse.json({
      ok: true,
      onboardingTourSeenAt: result.onboardingTourSeenAt.toISOString(),
      launchPadDismissedAt: result.launchPadDismissedAt.toISOString(),
    })
  } catch (err) {
    console.error('[onboarding/tour-seen] failed', err)
    return NextResponse.json(
      { error: 'Failed to mark tour seen' },
      { status: 500 },
    )
  }
}
