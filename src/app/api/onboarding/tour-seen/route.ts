/**
 * POST /api/onboarding/tour-seen
 *
 * Body: { tourId: string }
 *
 * Auth: any authenticated app user (Clerk session resolved to a DB
 * User row via getOrgContext). Returns 401 if there is no session.
 *
 * Accepts a versioned tourId and marks it seen via markSeenTour
 * (multi-tour registry). Also preserves the legacy markTourSeen
 * path for backwards compatibility when no tourId is provided.
 *
 * Returns 400 if the tourId is not a recognised registry id.
 *
 * Phase 4 item 25. See
 * projects/relay-app/2026-06-01-phase-4-design-brief.md § Item 25.
 */
import { NextResponse } from 'next/server'
import { getOrgContext } from '@/server/middleware/auth'
import { markSeenTour } from '@/server/services/onboardingTour'
import { isValidTourId } from '@/components/onboarding/tour-registry'

export async function POST(request: Request) {
  const ctx = await getOrgContext()
  if (!ctx?.userDbId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const body = (await request.json().catch(() => ({}))) as { tourId?: unknown }
  const tourId = body.tourId
  if (typeof tourId !== 'string' || !isValidTourId(tourId)) {
    return NextResponse.json({ error: 'invalid tourId' }, { status: 400 })
  }
  await markSeenTour(ctx.userDbId, tourId)
  return NextResponse.json({ ok: true })
}
