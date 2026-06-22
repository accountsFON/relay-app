import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
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

function makeThread(): PinPopoverThread {
  return {
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
    ],
    commentCount: 1,
  }
}

describe('PinPopover close behavior', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('closes on a pointer-down outside the popover', () => {
    const onClose = vi.fn()
    render(
      <PinPopover
        thread={makeThread()}
        anchor={{ x: 100, y: 100 }}
        mode="internal"
        onComment={async () => {}}
        onClose={onClose}
      />,
    )

    fireEvent.pointerDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does NOT close on a pointer-down inside the popover', () => {
    const onClose = vi.fn()
    render(
      <PinPopover
        thread={makeThread()}
        anchor={{ x: 100, y: 100 }}
        mode="internal"
        onComment={async () => {}}
        onClose={onClose}
      />,
    )

    fireEvent.pointerDown(screen.getByTestId('pin-popover'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('still closes on Escape', () => {
    const onClose = vi.fn()
    render(
      <PinPopover
        thread={makeThread()}
        anchor={{ x: 100, y: 100 }}
        mode="internal"
        onComment={async () => {}}
        onClose={onClose}
      />,
    )

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('warns before discarding an unsaved draft and stays open when cancelled', () => {
    const onClose = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(
      <PinPopover
        thread={makeThread()}
        anchor={{ x: 100, y: 100 }}
        mode="internal"
        onComment={async () => {}}
        onClose={onClose}
      />,
    )

    fireEvent.change(screen.getByTestId('pin-popover-input'), {
      target: { value: 'draft text' },
    })
    fireEvent.click(screen.getByTestId('pin-popover-close'))

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('discards when confirmed', () => {
    const onClose = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(
      <PinPopover
        thread={makeThread()}
        anchor={{ x: 100, y: 100 }}
        mode="internal"
        onComment={async () => {}}
        onClose={onClose}
      />,
    )

    fireEvent.change(screen.getByTestId('pin-popover-input'), {
      target: { value: 'draft text' },
    })
    fireEvent.click(screen.getByTestId('pin-popover-close'))

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not warn when the draft is empty', () => {
    const onClose = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm')
    render(
      <PinPopover
        thread={makeThread()}
        anchor={{ x: 100, y: 100 }}
        mode="internal"
        onComment={async () => {}}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByTestId('pin-popover-close'))

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
