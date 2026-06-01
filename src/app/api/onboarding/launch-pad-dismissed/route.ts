/**
 * POST /api/onboarding/launch-pad-dismissed
 *
 * Body: none.
 *
 * Auth: any authenticated app user (Clerk session resolved to a DB
 * User row via getOrgContext). Returns 401 if there is no session.
 *
 * Fires when the user taps "Skip, I'll explore" or the top right X
 * on /welcome. Sets User.launchPadDismissedAt = now() so the (app)
 * layout redirect predicate no longer matches.
 *
 * Idempotent: a second POST after the column is set just bumps the
 * timestamp.
 *
 * Phase 4 item 25. See
 * projects/relay-app/2026-06-01-phase-4-design-brief.md § Item 25.
 */
import { NextResponse } from 'next/server'
import { getOrgContext } from '@/server/middleware/auth'
import { markLaunchPadDismissed } from '@/server/services/onboardingTour'

export async function POST() {
  const ctx = await getOrgContext()
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await markLaunchPadDismissed(ctx.userDbId)
    return NextResponse.json({
      ok: true,
      launchPadDismissedAt: result.launchPadDismissedAt.toISOString(),
    })
  } catch (err) {
    console.error('[onboarding/launch-pad-dismissed] failed', err)
    return NextResponse.json(
      { error: 'Failed to dismiss launch pad' },
      { status: 500 },
    )
  }
}
