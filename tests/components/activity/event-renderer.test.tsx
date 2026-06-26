import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActivityKind } from '@prisma/client'
import { EventRenderer } from '@/components/activity/event-renderer'
import type { ActivityEventView } from '@/components/activity/types'

function makeEvent(
  kind: ActivityKind,
  payload: Record<string, unknown>,
  overrides: Partial<ActivityEventView> = {},
): ActivityEventView {
  return {
    id: 'e1',
    clientId: 'c1',
    runId: null,
    postId: null,
    kind,
    createdAt: new Date(),
    actor: { id: 'u1', name: 'Mollie' },
    payload: { kind: kind as unknown as string, ...payload } as ActivityEventView['payload'],
    myMention: null,
    ...overrides,
  }
}

describe('EventRenderer copy', () => {
  it('renders batch_sent_back with a period and "Reason:" instead of an em dash', () => {
    const event = makeEvent(ActivityKind.batch_sent_back, {
      batchId: 'b1',
      batchLabel: 'May Round 1',
      fromStep: 'am_review_design',
      toStep: 'in_design',
      fromUserName: 'Mollie',
      toUserName: 'Julio',
      reason: 'fonts off',
    })
    render(<EventRenderer event={event} />)
    const node = screen.getByText(/back to Julio for changes, now at Initial Design\. Reason: "fonts off"/)
    expect(node).toBeInTheDocument()
    expect(node.textContent ?? '').not.toMatch(/[\u2013\u2014]/)
  })

  it('renders a URL inside a system-event reason as a clickable link', () => {
    const event = makeEvent(ActivityKind.batch_sent_back, {
      batchId: 'b1',
      batchLabel: 'May Round 1',
      fromStep: 'am_review_design',
      toStep: 'in_design',
      fromUserName: 'Mollie',
      toUserName: 'Julio',
      reason: 'see https://ex.com/brief',
    })
    render(<EventRenderer event={event} />)
    const link = screen.getByRole('link', { name: 'https://ex.com/brief' })
    expect(link).toHaveAttribute('href', 'https://ex.com/brief')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders run_completed with a comma instead of an em dash', () => {
    const event = makeEvent(ActivityKind.run_completed, {
      targetMonth: '2026-05',
      postCount: 13,
    })
    render(<EventRenderer event={event} />)
    const node = screen.getByText(
      /2026-05 content generation complete, 13 posts ready for review/,
    )
    expect(node).toBeInTheDocument()
    expect(node.textContent ?? '').not.toMatch(/[\u2013\u2014]/)
  })

  it('renders batch_step_advanced with human step labels', () => {
    const event = makeEvent(ActivityKind.batch_step_advanced, {
      batchId: 'b1',
      batchLabel: 'May Round 1',
      step: 'client_decision',
      fromSubState: 'sent_to_client',
      toSubState: 'client_decision',
    })
    render(<EventRenderer event={event} />)
    expect(
      screen.getByText(
        /moved May Round 1 from Sent to client to Client review/,
      ),
    ).toBeInTheDocument()
  })

  it('renders client_am_assigned with full role name', () => {
    const event = makeEvent(ActivityKind.client_am_assigned, {
      assignedToName: 'Caleb',
    })
    render(<EventRenderer event={event} />)
    expect(
      screen.getByText(/assigned Caleb as Account Manager/),
    ).toBeInTheDocument()
  })

  it('lets a system event message wrap instead of clamping to one line', () => {
    // Regression: client-thread system rows used the CSS `truncate` class, so
    // long messages (e.g. "Caleb Cody assigned Caleb Cody as ...") were cut
    // off with no way to read the full text. They must wrap fully instead.
    const event = makeEvent(ActivityKind.client_am_assigned, {
      assignedToName: 'Caleb',
    })
    render(<EventRenderer event={event} />)
    // The message text now renders inside a <Linkify> <span>; the wrapping
    // classes live on the enclosing <p>, so assert against that.
    const para = screen.getByText(/assigned Caleb as Account Manager/).closest('p')!
    expect(para.className).not.toMatch(/\btruncate\b/)
    expect(para.className).toMatch(/break-words/)
  })

  it('shows an expandable diff for a new-shape client_profile_edited (changes present)', () => {
    const event = makeEvent(ActivityKind.client_profile_edited, {
      changes: [{ field: 'assetsFolderUrl', from: '(empty)', to: 'https://drive/x' }],
    })
    render(<EventRenderer event={event} />)
    expect(screen.getByText(/edited profile: Assets folder/)).toBeInTheDocument()
    expect(screen.queryByText('https://drive/x')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('https://drive/x')).toBeInTheDocument()
  })

  it('falls back to a non-expandable one-liner for an old-shape client_profile_edited (fieldsChanged only)', () => {
    const event = makeEvent(ActivityKind.client_profile_edited, {
      fieldsChanged: ['assetsFolderUrl'],
    })
    render(<EventRenderer event={event} />)
    expect(screen.getByText(/edited profile: Assets folder/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('makes review_caption_edit_accepted an expandable before/after', () => {
    const event = makeEvent(ActivityKind.review_caption_edit_accepted, {
      postId: 'postabc123def',
      reviewItemId: 'ri1',
      oldCaption: 'Old caption text',
      newCaption: 'New caption text',
      postVersionId: 'pv1',
    })
    render(<EventRenderer event={event} />)
    expect(screen.getByText(/accepted client caption edit on post postab/)).toBeInTheDocument()
    expect(screen.queryByText('Old caption text')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Old caption text')).toBeInTheDocument()
    expect(screen.getByText('New caption text')).toBeInTheDocument()
  })

  it('renders the edit diff even when the payload has no kind field (prod payload shape)', () => {
    const event = makeEvent(ActivityKind.client_profile_edited, {
      changes: [{ field: 'mainCta', from: 'A', to: 'B' }],
    })
    // Production writers store the payload WITHOUT a `kind` field, and the read
    // path does not inject one. The renderer must dispatch on event.kind, not
    // event.payload.kind. Strip the test helper's injected kind to prove it.
    delete (event.payload as { kind?: unknown }).kind
    render(<EventRenderer event={event} />)
    expect(screen.getByText(/edited profile: Main CTA/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('renders client_designer_assigned with capital Designer', () => {
    const event = makeEvent(ActivityKind.client_designer_assigned, {
      assignedToName: 'Caleb',
    })
    render(<EventRenderer event={event} />)
    expect(screen.getByText(/assigned Caleb as Designer/)).toBeInTheDocument()
  })

  it('renders client_am_unassigned with "removed ... as Account Manager"', () => {
    const event = makeEvent(ActivityKind.client_am_unassigned, {
      unassignedFromName: 'Caleb',
    })
    render(<EventRenderer event={event} />)
    expect(
      screen.getByText(/removed Caleb as Account Manager/),
    ).toBeInTheDocument()
  })

  it('renders run_started with "content generation"', () => {
    const event = makeEvent(ActivityKind.run_started, {
      targetMonth: '2026-05',
    })
    render(<EventRenderer event={event} />)
    expect(
      screen.getByText(/started content generation for 2026-05/),
    ).toBeInTheDocument()
  })

  it('renders run_failed with "content generation failed"', () => {
    const event = makeEvent(ActivityKind.run_failed, {
      targetMonth: '2026-05',
    })
    render(<EventRenderer event={event} />)
    expect(
      screen.getByText(/2026-05 content generation failed/),
    ).toBeInTheDocument()
  })

  it('renders post_thread_opened with the post ref and pin location', () => {
    const event = makeEvent(ActivityKind.post_thread_opened, {
      threadId: 't1',
      postId: 'postabc123def',
      pinLocation: 'caption',
    })
    render(<EventRenderer event={event} />)
    expect(
      screen.getByText(/opened a thread on post postab \(caption\)/),
    ).toBeInTheDocument()
  })

  it('renders post_thread_resolved with a quoted reason', () => {
    const event = makeEvent(ActivityKind.post_thread_resolved, {
      threadId: 't1',
      postId: 'postabc123def',
      resolvedReason: 'Caption rewritten',
    })
    render(<EventRenderer event={event} />)
    expect(
      screen.getByText(
        /resolved a thread on post postab\. Reason: "Caption rewritten"/,
      ),
    ).toBeInTheDocument()
  })

  it('renders post_caption_ai_fixed with a collapsible old/new diff', () => {
    const event = makeEvent(ActivityKind.post_caption_ai_fixed, {
      postId: 'postabc123def',
      threadId: 't1',
      oldCaption: 'Welcome to our new patio space.',
      newCaption: 'Welcome to our new outdoor seating area.',
      postVersionId: 'pv1',
    })
    render(<EventRenderer event={event} />)
    // Header always visible.
    expect(
      screen.getByText(/fixed caption with AI on post postab/),
    ).toBeInTheDocument()
    // Diff body collapsed by default.
    expect(
      screen.queryByText('Welcome to our new patio space.'),
    ).not.toBeInTheDocument()
    // Expand reveals both old + new.
    fireEvent.click(screen.getByRole('button'))
    expect(
      screen.getByText('Welcome to our new patio space.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Welcome to our new outdoor seating area.'),
    ).toBeInTheDocument()
  })

  it('renders magic_link_created with the recipient name and expiry date', () => {
    const event = makeEvent(ActivityKind.magic_link_created, {
      magicLinkId: 'ml1',
      batchId: 'b1',
      recipientName: 'Jane Doe',
      expiresAt: '2026-06-15T00:00:00.000Z',
    })
    render(<EventRenderer event={event} />)
    expect(
      screen.getByText(/sent a review link to Jane Doe, expires Jun 1[45]/),
    ).toBeInTheDocument()
  })

  it('renders magic_link_visited leading with the reviewer name and visit kind', () => {
    const event = makeEvent(ActivityKind.magic_link_visited, {
      magicLinkId: 'ml1',
      reviewerName: 'Jane Doe',
      isFirstVisit: true,
    })
    render(<EventRenderer event={event} />)
    expect(
      screen.getByText(/Jane Doe opened the review link \(first visit\)/),
    ).toBeInTheDocument()
  })

  it('humanizes field names on client_profile_edited', () => {
    const event = makeEvent(ActivityKind.client_profile_edited, {
      fieldsChanged: ['assignedAmId', 'assignedDesignerId', 'mainCta'],
    })
    render(<EventRenderer event={event} />)
    expect(
      screen.getByText(
        /edited profile: Account Manager, Designer, Main CTA/,
      ),
    ).toBeInTheDocument()
  })

  it('renders review_session_started with the round number', () => {
    const event = makeEvent(ActivityKind.review_session_started, {
      reviewSessionId: 'rs1',
      reviewerId: 'u9',
      round: 1,
    })
    render(<EventRenderer event={event} />)
    expect(
      screen.getByText(/started review, round 1/),
    ).toBeInTheDocument()
  })

  it('renders review_session_submitted with inline summary chips', () => {
    const event = makeEvent(ActivityKind.review_session_submitted, {
      reviewSessionId: 'rs1',
      round: 1,
      summary: {
        approved: 8,
        changesRequested: 4,
        captionEdited: 1,
        totalPosts: 13,
      },
    })
    render(<EventRenderer event={event} />)
    expect(
      screen.getByText(
        /submitted review, round 1 \(8 approved, 4 changes, 1 edits\)/,
      ),
    ).toBeInTheDocument()
  })

  it('renders review_caption_edit_accepted with the post ref', () => {
    const event = makeEvent(ActivityKind.review_caption_edit_accepted, {
      postId: 'postabc123def',
      reviewItemId: 'ri1',
      oldCaption: 'Old',
      newCaption: 'New',
      postVersionId: 'pv1',
    })
    render(<EventRenderer event={event} />)
    expect(
      screen.getByText(/accepted client caption edit on post postab/),
    ).toBeInTheDocument()
  })

  it('renders review_item_addressed with the post ref', () => {
    const event = makeEvent(ActivityKind.review_item_addressed, {
      postId: 'postabc123def',
      reviewItemId: 'ri1',
      decision: 'changes_requested',
      addressedBy: 'u1',
    })
    render(<EventRenderer event={event} />)
    expect(
      screen.getByText(/marked feedback addressed on post postab/),
    ).toBeInTheDocument()
  })

  it('renders review_item_unaddressed with unaccepted=true containing "unaddressed"', () => {
    const event = makeEvent(ActivityKind.review_item_unaddressed, {
      postId: 'p1',
      reviewItemId: 'i1',
      unaccepted: true,
      pinsReopened: 2,
    })
    render(<EventRenderer event={event} />)
    expect(screen.getByText(/unaddressed/)).toBeInTheDocument()
  })

  it('renders review_item_unaddressed with unaccepted=false containing "unaddressed"', () => {
    const event = makeEvent(ActivityKind.review_item_unaddressed, {
      postId: 'p1',
      reviewItemId: 'i1',
      unaccepted: false,
      pinsReopened: 0,
    })
    render(<EventRenderer event={event} />)
    expect(screen.getByText(/unaddressed/)).toBeInTheDocument()
  })

  it('renders review_round_started with the round number', () => {
    const event = makeEvent(ActivityKind.review_round_started, {
      magicLinkId: 'ml2',
      round: 2,
    })
    render(<EventRenderer event={event} />)
    expect(
      screen.getByText(/opened round 2 for re-review/),
    ).toBeInTheDocument()
  })

  it('renders client_review_decided approved with batch label', () => {
    const event = makeEvent(ActivityKind.client_review_decided, {
      batchId: 'b1',
      batchLabel: 'Cedar Creek May 2026',
      fromStep: 'sent_to_client',
      toStep: 'ready_to_schedule',
      decision: 'approved',
      reviewerName: 'Sarah',
      toUserName: 'Mollie',
      newHolderId: 'user_am',
      newHolderRole: 'am',
    })
    render(<EventRenderer event={event} />)
    const node = screen.getByText(/approved/)
    expect(node).toBeInTheDocument()
    expect(node.textContent ?? '').toMatch(/Cedar Creek May 2026/)
  })

  it('renders client_review_decided changes with "requested changes"', () => {
    const event = makeEvent(ActivityKind.client_review_decided, {
      batchId: 'b1',
      batchLabel: 'Cedar Creek May 2026',
      fromStep: 'sent_to_client',
      toStep: 'implementing_revisions',
      decision: 'changes',
      reviewerName: 'Sarah',
      toUserName: 'Mollie',
      newHolderId: 'user_am',
      newHolderRole: 'am',
    })
    render(<EventRenderer event={event} />)
    expect(screen.getByText(/requested changes/)).toBeInTheDocument()
  })

  // ---------------------------------------------------------------------
  // AM / admin holder override copy
  // ---------------------------------------------------------------------
  // When the actor wasn't the current holder but had permission to advance
  // anyway (AM/admin), the renderer prefixes the message with "overrode
  // the holder and ...". Default behavior (wasOverride absent or false)
  // stays as-is.

  it('renders batch_passed normally when wasOverride is absent', () => {
    const event = makeEvent(ActivityKind.batch_passed, {
      batchId: 'b1',
      batchLabel: 'May Round 1',
      fromStep: 'copy',
      toStep: 'in_design',
      fromUserName: 'Mollie',
      toUserName: 'Julio',
    })
    render(<EventRenderer event={event} />)
    expect(
      screen.getByText(/passed the baton on May Round 1 to Julio, now at Initial Design/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/overrode the holder/)).not.toBeInTheDocument()
  })

  it('renders batch_passed with override prefix when wasOverride=true', () => {
    const event = makeEvent(ActivityKind.batch_passed, {
      batchId: 'b1',
      batchLabel: 'May Round 1',
      fromStep: 'copy',
      toStep: 'in_design',
      fromUserName: 'Mollie',
      toUserName: 'Julio',
      wasOverride: true,
    })
    render(<EventRenderer event={event} />)
    expect(
      screen.getByText(/overrode the holder and passed the baton on May Round 1 to Julio, now at Initial Design/),
    ).toBeInTheDocument()
  })

  it('renders batch_sent_back with override prefix when wasOverride=true', () => {
    const event = makeEvent(ActivityKind.batch_sent_back, {
      batchId: 'b1',
      batchLabel: 'May Round 1',
      fromStep: 'am_review_design',
      toStep: 'in_design',
      fromUserName: 'Mollie',
      toUserName: 'Julio',
      reason: 'fonts off',
      wasOverride: true,
    })
    render(<EventRenderer event={event} />)
    expect(
      screen.getByText(
        /overrode the holder and sent May Round 1 back to Julio for changes, now at Initial Design\. Reason: "fonts off"/,
      ),
    ).toBeInTheDocument()
  })

  it('renders batch_completed normally when wasOverride is absent', () => {
    const event = makeEvent(ActivityKind.batch_completed, {
      batchId: 'b1',
      batchLabel: 'Cedar Creek May 2026',
      completedByName: 'Mollie',
    })
    render(<EventRenderer event={event} />)
    expect(
      screen.getByText(/brought Cedar Creek May 2026 across the finish line/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/overrode the holder/)).not.toBeInTheDocument()
  })

  it('renders batch_completed with override prefix when wasOverride=true', () => {
    const event = makeEvent(ActivityKind.batch_completed, {
      batchId: 'b1',
      batchLabel: 'Cedar Creek May 2026',
      completedByName: 'Mollie',
      wasOverride: true,
    })
    render(<EventRenderer event={event} />)
    expect(
      screen.getByText(/overrode the holder and brought Cedar Creek May 2026 across the finish line/),
    ).toBeInTheDocument()
  })
})

describe('revision_images_requested', () => {
  it('renders with "Image revisions requested — designer notified" message (actorless)', () => {
    const event = makeEvent(
      ActivityKind.revision_images_requested,
      {
        batchId: 'b1',
        batchLabel: 'Greenway Mar 2026',
        reviewSessionId: 'rs9',
      },
      { actor: null },
    )
    render(<EventRenderer event={event} />)
    expect(
      screen.getByText(/Image revisions requested — designer notified/),
    ).toBeInTheDocument()
  })
})

describe('batch_force_stepped', () => {
  it('renders the force moved message with human step labels', () => {
    const event = makeEvent(ActivityKind.batch_force_stepped, {
      batchId: 'b1',
      batchLabel: 'May 2026',
      fromStep: 'am_review_design',
      toStep: 'copy',
      fromUserName: 'Mollie',
      toUserName: 'Julio',
      newHolderId: 'u_am',
      reason: null,
    })
    render(<EventRenderer event={event} />)
    expect(
      screen.getByText(/force moved May 2026 from Design Review to Copy Review/),
    ).toBeInTheDocument()
  })

  it('inlines the reason when present', () => {
    const event = makeEvent(ActivityKind.batch_force_stepped, {
      batchId: 'b1',
      batchLabel: 'May 2026',
      fromStep: 'am_review_design',
      toStep: 'copy',
      fromUserName: 'Mollie',
      toUserName: 'Julio',
      reason: 'redo brief',
    })
    render(<EventRenderer event={event} />)
    const node = screen.getByText(/force moved May 2026 from Design Review to Copy Review\. Reason: "redo brief"/)
    expect(node).toBeInTheDocument()
    expect(node.textContent ?? '').not.toMatch(/[–—]/) // no em/en dashes
  })

  it('omits the reason clause when reason is null', () => {
    const event = makeEvent(ActivityKind.batch_force_stepped, {
      batchId: 'b1',
      batchLabel: 'May 2026',
      fromStep: 'am_review_design',
      toStep: 'copy',
      fromUserName: 'Mollie',
      toUserName: 'Julio',
      reason: null,
    })
    render(<EventRenderer event={event} />)
    const node = screen.getByText(/force moved May 2026/)
    expect(node.textContent ?? '').not.toMatch(/Reason:/)
  })
})
