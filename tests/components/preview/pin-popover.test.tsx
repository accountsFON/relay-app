import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { PinPopover, type PinPopoverThread } from '@/components/preview/pin-popover'

describe('PinPopover comment image rendering', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders a comment-image img when the comment has imageUrl set', () => {
    const thread: PinPopoverThread = {
      id: 't-img',
      pin: { kind: 'image', x: 10, y: 20 },
      status: 'open',
      firstComment: {
        id: 'c-img',
        author: { kind: 'client', reviewerName: 'Amy' },
        body: 'see attachment',
        createdAt: new Date('2026-06-01T10:00:00Z'),
      },
      comments: [
        {
          id: 'c-img',
          author: { kind: 'client', reviewerName: 'Amy' },
          body: 'see attachment',
          createdAt: new Date('2026-06-01T10:00:00Z'),
          imageUrl: 'https://blob.example.com/ref.jpg',
          imageWidth: 800,
          imageHeight: 600,
        },
      ],
      commentCount: 1,
    }

    render(
      <PinPopover
        thread={thread}
        anchor={{ x: 100, y: 100 }}
        mode="internal"
        onComment={async () => {}}
      />,
    )

    const img = screen.getByTestId('comment-image')
    expect(img).toBeTruthy()
    expect(img.getAttribute('src')).toBe('https://blob.example.com/ref.jpg')
  })

  it('does NOT render a comment-image img when the comment has no imageUrl', () => {
    const thread: PinPopoverThread = {
      id: 't-no-img',
      pin: { kind: 'image', x: 10, y: 20 },
      status: 'open',
      firstComment: {
        id: 'c-no-img',
        author: { kind: 'client', reviewerName: 'Amy' },
        body: 'plain comment',
        createdAt: new Date('2026-06-01T10:00:00Z'),
      },
      comments: [
        {
          id: 'c-no-img',
          author: { kind: 'client', reviewerName: 'Amy' },
          body: 'plain comment',
          createdAt: new Date('2026-06-01T10:00:00Z'),
        },
      ],
      commentCount: 1,
    }

    render(
      <PinPopover
        thread={thread}
        anchor={{ x: 100, y: 100 }}
        mode="internal"
        onComment={async () => {}}
      />,
    )

    expect(screen.queryByTestId('comment-image')).toBeNull()
  })
})

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
        id: 'c1',
        author: { kind: 'client', reviewerName: 'Sarah' },
        body: 'first comment',
        createdAt: new Date('2026-05-15T10:00:00Z'),
      },
      comments: [
        {
          id: 'c1',
          author: { kind: 'client', reviewerName: 'Sarah' },
          body: 'first comment',
          createdAt: new Date('2026-05-15T10:00:00Z'),
        },
        {
          id: 'c2',
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
      id: 'c1',
      author: { kind: 'client', reviewerName: 'Sarah' },
      body: 'first comment',
      createdAt: new Date('2026-05-15T10:00:00Z'),
    },
    comments: [
      {
        id: 'c1',
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

// ── Task 12: "Use as post image" button (AM-only) ──────────────────────────

function makeThreadWithImage(commentId = 'c-img-1'): PinPopoverThread {
  return {
    id: 't-use-as-post',
    pin: { kind: 'image', x: 20, y: 30 },
    status: 'open',
    firstComment: {
      id: commentId,
      author: { kind: 'client', reviewerName: 'Bob' },
      body: 'here is my ref',
      createdAt: new Date('2026-06-22T10:00:00Z'),
      imageUrl: 'https://blob.example.com/ref.jpg',
      imageWidth: 800,
      imageHeight: 600,
    },
    comments: [
      {
        id: commentId,
        author: { kind: 'client', reviewerName: 'Bob' },
        body: 'here is my ref',
        createdAt: new Date('2026-06-22T10:00:00Z'),
        imageUrl: 'https://blob.example.com/ref.jpg',
        imageWidth: 800,
        imageHeight: 600,
      },
    ],
    commentCount: 1,
  }
}

describe('PinPopover "Use as post image" button', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders the button in internal mode when comment has imageUrl and onUseAsPostImage is provided', () => {
    const onUseAsPostImage = vi.fn().mockResolvedValue(undefined)
    render(
      <PinPopover
        thread={makeThreadWithImage()}
        anchor={{ x: 100, y: 100 }}
        mode="internal"
        onComment={async () => {}}
        onUseAsPostImage={onUseAsPostImage}
      />,
    )

    expect(screen.getByTestId('use-as-post-image-btn')).toBeTruthy()
  })

  it('calls onUseAsPostImage with the comment id when the button is clicked', async () => {
    const onUseAsPostImage = vi.fn().mockResolvedValue(undefined)
    render(
      <PinPopover
        thread={makeThreadWithImage('comment-abc')}
        anchor={{ x: 100, y: 100 }}
        mode="internal"
        onComment={async () => {}}
        onUseAsPostImage={onUseAsPostImage}
      />,
    )

    fireEvent.click(screen.getByTestId('use-as-post-image-btn'))
    await waitFor(() => {
      expect(onUseAsPostImage).toHaveBeenCalledWith('comment-abc')
    })
  })

  it('does NOT render the button in review mode even when onUseAsPostImage is provided', () => {
    const onUseAsPostImage = vi.fn().mockResolvedValue(undefined)
    render(
      <PinPopover
        thread={makeThreadWithImage()}
        anchor={{ x: 100, y: 100 }}
        mode="review"
        onComment={async () => {}}
        onUseAsPostImage={onUseAsPostImage}
      />,
    )

    expect(screen.queryByTestId('use-as-post-image-btn')).toBeNull()
  })

  it('does NOT render the button in internal mode when comment has no imageUrl', () => {
    const threadNoImg: PinPopoverThread = {
      id: 't-no-img',
      pin: { kind: 'post' },
      status: 'open',
      firstComment: {
        id: 'c-plain',
        author: { kind: 'am', userId: 'u1', name: 'Julio' },
        body: 'plain note',
        createdAt: new Date('2026-06-22T10:00:00Z'),
      },
      comments: [
        {
          id: 'c-plain',
          author: { kind: 'am', userId: 'u1', name: 'Julio' },
          body: 'plain note',
          createdAt: new Date('2026-06-22T10:00:00Z'),
        },
      ],
      commentCount: 1,
    }
    const onUseAsPostImage = vi.fn().mockResolvedValue(undefined)
    render(
      <PinPopover
        thread={threadNoImg}
        anchor={{ x: 100, y: 100 }}
        mode="internal"
        onComment={async () => {}}
        onUseAsPostImage={onUseAsPostImage}
      />,
    )

    expect(screen.queryByTestId('use-as-post-image-btn')).toBeNull()
  })

  it('does NOT render the button when onUseAsPostImage is not provided (no prop)', () => {
    render(
      <PinPopover
        thread={makeThreadWithImage()}
        anchor={{ x: 100, y: 100 }}
        mode="internal"
        onComment={async () => {}}
      />,
    )

    expect(screen.queryByTestId('use-as-post-image-btn')).toBeNull()
  })
})
