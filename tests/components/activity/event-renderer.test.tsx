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
    const node = screen.getByText(/back to Julio\. Reason: "fonts off"/)
    expect(node).toBeInTheDocument()
    expect(node.textContent ?? '').not.toMatch(/[\u2013\u2014]/)
  })

  it('renders run_completed with a comma instead of an em dash', () => {
    const event = makeEvent(ActivityKind.run_completed, {
      targetMonth: '2026-05',
      postCount: 13,
    })
    render(<EventRenderer event={event} />)
    const node = screen.getByText(
      /2026-05 run complete, 13 posts ready for review/,
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
})
