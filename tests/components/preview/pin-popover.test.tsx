import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PinPopover, type PinPopoverThread } from '@/components/preview/pin-popover'

/**
 * Regression test for the pin-thread multi-comment bug: the popover must
 * render EVERY comment in thread.comments, not just the first. Previously the
 * hydration dropped comments 2..N so a reviewer's reply vanished.
 */
describe('PinPopover renders full comment thread', () => {
  it('renders all comments when thread.comments has multiple entries', () => {
    const thread: PinPopoverThread = {
      id: 't1',
      pin: { kind: 'image', x: 30, y: 40 },
      status: 'open',
      firstComment: {
        author: { kind: 'client', reviewerName: 'Sarah' },
        body: 'first comment',
        createdAt: new Date('2026-05-15T10:00:00Z'),
      },
      comments: [
        {
          author: { kind: 'client', reviewerName: 'Sarah' },
          body: 'first comment',
          createdAt: new Date('2026-05-15T10:00:00Z'),
        },
        {
          author: { kind: 'am', userId: 'u1', name: 'Mollie' },
          body: 'second comment',
          createdAt: new Date('2026-05-15T10:05:00Z'),
        },
      ],
      commentCount: 2,
    }

    render(
      <PinPopover
        thread={thread}
        anchor={{ x: 100, y: 100 }}
        mode="internal"
        onComment={async () => {}}
      />,
    )

    const list = screen.getByTestId('pin-popover-comments')
    expect(list).toHaveTextContent('first comment')
    expect(list).toHaveTextContent('second comment')
  })
})
