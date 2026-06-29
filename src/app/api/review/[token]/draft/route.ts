/**
 * PATCH /api/review/[token]/draft
 *
 * Body: { postId: string, decision?: ReviewDecisionType,
 *         comment?: string | null, suggestedCaption?: string | null }
 *
 * Auth: magic-link reviewer (middleware-validated URL token + signed
 * `magic-link-session` cookie). The service layer re-verifies both
 * because /api/* requests do not run through the /review/* guard.
 *
 * Every tap on the v2 client review surface fires this route: decision
 * button taps, comment textarea blurs, caption edit saves. Survives
 * tab close, device switch, browser crash, the upsert key is
 * (reviewSessionId, postId), so a draft can be re-saved an unbounded
 * number of times before Submit Review flips the session to submitted.
 *
 * Layer 1 of the v2 redesign. See
 * projects/relay-app/2026-05-17-client-review-session-redesign-design.md
 * § Mid-session interruption for the UX rationale.
 */
import { NextResponse, type NextRequest } from 'next/server'
import {
  saveItemDraft,
  ReviewDraftInvalidInputError,
  ReviewDraftLinkGoneError,
  ReviewDraftPostNotInBatchError,
  ReviewDraftSessionClosedError,
  ReviewDraftUnauthorizedError,
} from '@/server/services/reviewDraft'
import type { ReviewDecisionType } from '@/types/review-session'

const ALLOWED_DECISIONS: ReadonlySet<ReviewDecisionType> = new Set<ReviewDecisionType>([
  'not_reviewed',
  'approved',
  'changes_requested',
  'caption_edited',
])

function isAllowedDecision(value: unknown): value is ReviewDecisionType {
  return typeof value === 'string' && ALLOWED_DECISIONS.has(value as ReviewDecisionType)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  let body: {
    postId?: unknown
    decision?: unknown
    comment?: unknown
    suggestedCaption?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const postId = typeof body.postId === 'string' ? body.postId : null
  if (!postId) {
    return NextResponse.json(
      { error: 'postId is required' },
      { status: 400 },
    )
  }

  // decision is optional but, when provided, must be one of the enum
  // string literals. Reject anything else early so the service layer
  // never sees a junk value.
  let decision: ReviewDecisionType | undefined
  if (body.decision !== undefined) {
    if (!isAllowedDecision(body.decision)) {
      return NextResponse.json(
        { error: 'decision must be one of: not_reviewed, approved, changes_requested, caption_edited' },
        { status: 400 },
      )
    }
    decision = body.decision
  }

  // comment / suggestedCaption use a tri-state: undefined means "leave
  // alone", null means "clear", string means "set". Reject any other type.
  let comment: string | null | undefined
  if (body.comment !== undefined) {
    if (body.comment !== null && typeof body.comment !== 'string') {
      return NextResponse.json(
        { error: 'comment must be a string or null' },
        { status: 400 },
      )
    }
    comment = body.comment
  }

  let suggestedCaption: string | null | undefined
  if (body.suggestedCaption !== undefined) {
    if (body.suggestedCaption !== null && typeof body.suggestedCaption !== 'string') {
      return NextResponse.json(
        { error: 'suggestedCaption must be a string or null' },
        { status: 400 },
      )
    }
    suggestedCaption = body.suggestedCaption
  }

  try {
    const item = await saveItemDraft({
      token,
      postId,
      decision,
      comment,
      suggestedCaption,
    })
    return NextResponse.json({ ok: true, item })
  } catch (err) {
    if (err instanceof ReviewDraftUnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 })
    }
    if (err instanceof ReviewDraftLinkGoneError) {
      return NextResponse.json({ error: err.message }, { status: 410 })
    }
    if (err instanceof ReviewDraftPostNotInBatchError) {
      return NextResponse.json({ error: err.message }, { status: 403 })
    }
    if (err instanceof ReviewDraftInvalidInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    if (err instanceof ReviewDraftSessionClosedError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    console.error('[review/draft] saveItemDraft failed', err)
    return NextResponse.json(
      { error: 'Failed to save review draft' },
      { status: 500 },
    )
  }
}
