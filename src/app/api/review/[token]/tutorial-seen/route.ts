/**
 * POST /api/review/[token]/tutorial-seen
 *
 * Body: none (the reviewer is identified by the signed cookie session).
 *
 * Auth: magic-link reviewer (middleware-validated URL token + signed
 * `magic-link-session` cookie). The service layer re-verifies both
 * because /api/* requests do not run through the /review/* guard.
 *
 * Fires once per reviewer when they dismiss the first visit tutorial
 * modal on /review (any of: Got it on step 1, Got it on step 2, top
 * right X). Sets MagicLinkReviewer.tutorialSeenAt so the modal does
 * not render on subsequent visits.
 *
 * Phase 4 item 24. See
 * projects/relay-app/2026-06-01-phase-4-design-brief.md § Item 24.
 */
import { NextResponse, type NextRequest } from 'next/server'
import {
  markTutorialSeen,
  ReviewTutorialLinkGoneError,
  ReviewTutorialUnauthorizedError,
} from '@/server/services/reviewTutorial'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  try {
    const result = await markTutorialSeen({ token })
    return NextResponse.json({
      ok: true,
      tutorialSeenAt: result.tutorialSeenAt.toISOString(),
    })
  } catch (err) {
    if (err instanceof ReviewTutorialUnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 })
    }
    if (err instanceof ReviewTutorialLinkGoneError) {
      return NextResponse.json({ error: err.message }, { status: 410 })
    }
    console.error('[review/tutorial-seen] markTutorialSeen failed', err)
    return NextResponse.json(
      { error: 'Failed to mark tutorial seen' },
      { status: 500 },
    )
  }
}
