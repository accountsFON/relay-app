import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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
