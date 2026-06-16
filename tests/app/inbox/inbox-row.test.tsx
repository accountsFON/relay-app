import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InboxRow } from '@/app/(app)/inbox/inbox-row'
import { ActivityKind } from '@prisma/client'
import type { MentionInboxRow } from '@/components/activity/types'
import { clearMentionAction, markMentionReadAction } from '@/app/(app)/clients/[id]/activity/actions'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/app/(app)/clients/[id]/activity/actions', () => ({
  markMentionReadAction: vi.fn(),
  clearMentionAction: vi.fn().mockResolvedValue(undefined),
}))

function makeRow(overrides: Partial<MentionInboxRow> = {}): MentionInboxRow {
  return {
    mentionId: 'mention-1',
    readAt: null,
    client: { id: 'client-1', name: 'Cedar Creek Dental' },
    postBatchId: null,
    event: {
      id: 'event-1',
      clientId: 'client-1',
      runId: 'run-1',
      postId: null,
      kind: ActivityKind.run_completed,
      createdAt: new Date(),
      actor: null,
      payload: {
        kind: 'run_completed',
        targetMonth: '2026-05',
        postCount: 13,
        totalCostUsd: 0.6,
        batchId: 'batch-9',
      },
      mention: null,
    },
    ...overrides,
  } as MentionInboxRow
}

describe('InboxRow run_completed', () => {
  it('renders the post count in the summary', () => {
    render(<InboxRow row={makeRow()} />)
    expect(screen.getByText(/13 posts ready/i)).toBeInTheDocument()
  })

  it('prefixes the client name on the summary', () => {
    render(<InboxRow row={makeRow()} />)
    expect(screen.getByText(/Cedar Creek Dental ·/)).toBeInTheDocument()
  })

  it('deep-links to the generated batch (with anchor fragment) when batchId is in payload', () => {
    render(<InboxRow row={makeRow()} />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe(
      '/clients/client-1/batches/batch-9#comment-event-1',
    )
  })

  it('falls back to the run page when no batchId is in payload', () => {
    const row = makeRow({
      event: {
        ...makeRow().event,
        payload: {
          kind: 'run_completed',
          targetMonth: '2026-05',
          postCount: 13,
        },
      } as MentionInboxRow['event'],
    })
    render(<InboxRow row={row} />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('/clients/client-1/runs/run-1')
  })

  it('renders a generic message when postCount is missing', () => {
    const row = makeRow({
      event: {
        ...makeRow().event,
        payload: { kind: 'run_completed' },
      } as MentionInboxRow['event'],
    })
    render(<InboxRow row={row} />)
    expect(screen.getByText(/posts ready for your review/i)).toBeInTheDocument()
  })
})

describe('InboxRow new copy', () => {
  function makeBatchRow(
    kind: ActivityKind,
    payload: Record<string, unknown>,
  ): MentionInboxRow {
    return {
      mentionId: 'mention-x',
      readAt: null,
      client: { id: 'client-1', name: 'Cedar Creek Dental' },
      postBatchId: null,
      event: {
        id: 'event-x',
        clientId: 'client-1',
        runId: null,
        postId: null,
        kind,
        createdAt: new Date(),
        actor: { id: 'user-1', name: 'Mollie' },
        payload: { kind: kind as unknown as string, ...payload },
        mention: null,
      },
    } as MentionInboxRow
  }

  it('renders batch_passed with the relay name and step label', () => {
    const row = makeBatchRow(ActivityKind.batch_passed, {
      batchId: 'b1',
      batchLabel: 'May Round 1',
      toStep: 'am_review_design',
      fromStep: 'in_design',
      fromUserName: 'Julio',
      toUserName: 'Mollie',
    })
    render(<InboxRow row={row} />)
    expect(
      screen.getByText(
        /Cedar Creek Dental · Mollie passed you the baton on "May Round 1"\. Now at AM review \(design\)\./,
      ),
    ).toBeInTheDocument()
  })

  it('renders batch_sent_back with a "for changes" tail', () => {
    const row = makeBatchRow(ActivityKind.batch_sent_back, {
      batchId: 'b1',
      batchLabel: 'May Round 1',
      fromStep: 'am_review_design',
      toStep: 'in_design',
      fromUserName: 'Mollie',
      toUserName: 'Julio',
      reason: 'fonts off',
    })
    render(<InboxRow row={row} />)
    expect(
      screen.getByText(
        /Cedar Creek Dental · Mollie sent "May Round 1" back to you for changes\. Now at Design\./,
      ),
    ).toBeInTheDocument()
  })

  it('renders batch_revision_dispatched with item type and description', () => {
    const row = makeBatchRow(ActivityKind.batch_revision_dispatched, {
      batchId: 'b1',
      batchLabel: 'May Round 1',
      itemId: 'i1',
      itemType: 'copy',
      itemDescription: 'Tighten the CTA',
      assignedToName: 'Julio',
    })
    render(<InboxRow row={row} />)
    expect(
      screen.getByText(
        /Cedar Creek Dental · Mollie asked you to revise copy: "Tighten the CTA"/,
      ),
    ).toBeInTheDocument()
  })

  it('renders batch_revision_completed', () => {
    const row = makeBatchRow(ActivityKind.batch_revision_completed, {
      batchId: 'b1',
      batchLabel: 'May Round 1',
      itemId: 'i1',
      itemType: 'copy',
      itemDescription: 'Tighten the CTA',
      completedByName: 'Julio',
    })
    render(<InboxRow row={row} />)
    expect(
      screen.getByText(/Cedar Creek Dental · Mollie marked the revision complete\./),
    ).toBeInTheDocument()
  })

  it('renders batch_step_advanced with relay label and step label', () => {
    const row = makeBatchRow(ActivityKind.batch_step_advanced, {
      batchId: 'b1',
      batchLabel: 'May Round 1',
      step: 'client_decision',
      fromSubState: 'sent_to_client',
      toSubState: 'client_decision',
    })
    render(<InboxRow row={row} />)
    expect(
      screen.getByText(
        /Cedar Creek Dental · Mollie moved "May Round 1" to Client review\./,
      ),
    ).toBeInTheDocument()
  })

  it('renders client_am_assigned with full role name', () => {
    const row = makeBatchRow(ActivityKind.client_am_assigned, {
      assignedToName: 'Caleb',
    })
    render(<InboxRow row={row} />)
    expect(
      screen.getByText(
        /Cedar Creek Dental · Mollie assigned you as the Account Manager for Cedar Creek Dental\./,
      ),
    ).toBeInTheDocument()
  })

  it('renders client_designer_assigned with full role name', () => {
    const row = makeBatchRow(ActivityKind.client_designer_assigned, {
      assignedToName: 'Caleb',
    })
    render(<InboxRow row={row} />)
    expect(
      screen.getByText(
        /Cedar Creek Dental · Mollie assigned you as the Designer for Cedar Creek Dental\./,
      ),
    ).toBeInTheDocument()
  })

  it('renders member_role_changed with new role', () => {
    const row = makeBatchRow(ActivityKind.member_role_changed, {
      targetUserName: 'Caleb',
      fromRole: 'designer',
      toRole: 'account_manager',
    })
    render(<InboxRow row={row} />)
    expect(
      screen.getByText(/Mollie changed your role to account_manager\./),
    ).toBeInTheDocument()
  })

  it('renders run_failed with month and client name', () => {
    const row = makeBatchRow(ActivityKind.run_failed, {
      targetMonth: '2026-05',
    })
    render(<InboxRow row={row} />)
    expect(
      screen.getByText(
        /Cedar Creek Dental · 2026-05 content generation failed for Cedar Creek Dental\./,
      ),
    ).toBeInTheDocument()
  })
})

describe('InboxRow unread vs read distinction', () => {
  it('shows a coral unread dot (+ sr-only label) and bold summary when unread', () => {
    render(<InboxRow row={makeRow({ readAt: null })} />)
    expect(screen.getByTestId('inbox-unread-dot')).toBeInTheDocument()
    expect(screen.getByText('Unread')).toBeInTheDocument()
    expect(screen.getByText(/posts ready/i).className).toContain('font-semibold')
  })

  it('hides the unread dot and dims the summary when read', () => {
    render(<InboxRow row={makeRow({ readAt: new Date() })} />)
    expect(screen.queryByTestId('inbox-unread-dot')).toBeNull()
    expect(screen.queryByText('Unread')).toBeNull()
    const summary = screen.getByText(/posts ready/i)
    expect(summary.className).toContain('text-neutral-500')
    expect(summary.className).not.toContain('font-semibold')
  })
})

describe('InboxRow clear (X button)', () => {
  it('clears the mention and removes the row without navigating', () => {
    const { container } = render(<InboxRow row={makeRow({ readAt: null })} />)
    const x = screen.getByRole('button', { name: /clear notification/i })
    fireEvent.click(x)
    expect(clearMentionAction).toHaveBeenCalledWith('mention-1')
    expect(markMentionReadAction).not.toHaveBeenCalled()
    expect(container.querySelector('a')).toBeNull()
  })
})
