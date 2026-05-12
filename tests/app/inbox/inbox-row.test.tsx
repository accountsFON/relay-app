import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InboxRow } from '@/app/(app)/inbox/inbox-row'
import { ActivityKind } from '@prisma/client'
import type { MentionInboxRow } from '@/components/activity/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/app/(app)/clients/[id]/activity/actions', () => ({
  markMentionReadAction: vi.fn(),
}))

function makeRow(overrides: Partial<MentionInboxRow> = {}): MentionInboxRow {
  return {
    mentionId: 'mention-1',
    readAt: null,
    client: { id: 'client-1', name: 'Cedar Creek Dental' },
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

  it('deep-links to the generated batch when batchId is in payload', () => {
    render(<InboxRow row={makeRow()} />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('/clients/client-1/batches/batch-9')
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
