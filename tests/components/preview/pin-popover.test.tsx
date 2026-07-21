import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

// ── Author bylines + wrapping ─────────────────────────────────────────────────

describe('PinPopover author bylines', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows a client magic-link reviewerName as the comment author', () => {
    const thread: PinPopoverThread = {
      id: 't-client-name',
      pin: { kind: 'post' },
      status: 'open',
      firstComment: {
        id: 'c1',
        author: { kind: 'client', reviewerName: 'Priya Sharma' },
        body: 'Looks great!',
        createdAt: new Date('2026-07-01T10:00:00Z'),
      },
      comments: [
        {
          id: 'c1',
          author: { kind: 'client', reviewerName: 'Priya Sharma' },
          body: 'Looks great!',
          createdAt: new Date('2026-07-01T10:00:00Z'),
        },
      ],
      commentCount: 1,
    }

    render(
      <PinPopover
        thread={thread}
        anchor={{ x: 100, y: 100 }}
        mode="review"
        onComment={async () => {}}
      />,
    )

    const list = screen.getByTestId('pin-popover-comments')
    expect(list).toHaveTextContent('Priya Sharma')
  })

  it('shows an AM account name as the comment author', () => {
    const thread: PinPopoverThread = {
      id: 't-am-name',
      pin: { kind: 'post' },
      status: 'open',
      firstComment: {
        id: 'c1',
        author: { kind: 'am', userId: 'u-mollie', name: 'Mollie Huebner' },
        body: 'Here is my note.',
        createdAt: new Date('2026-07-01T10:00:00Z'),
      },
      comments: [
        {
          id: 'c1',
          author: { kind: 'am', userId: 'u-mollie', name: 'Mollie Huebner' },
          body: 'Here is my note.',
          createdAt: new Date('2026-07-01T10:00:00Z'),
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

    const list = screen.getByTestId('pin-popover-comments')
    expect(list).toHaveTextContent('Mollie Huebner')
  })

  it('does not show "Unknown" or blank when a client has a reviewerName', () => {
    const thread: PinPopoverThread = {
      id: 't-no-unknown',
      pin: { kind: 'post' },
      status: 'open',
      firstComment: {
        id: 'c1',
        author: { kind: 'client', reviewerName: 'Jordan Lee' },
        body: 'Change the color please.',
        createdAt: new Date('2026-07-01T10:00:00Z'),
      },
      comments: [
        {
          id: 'c1',
          author: { kind: 'client', reviewerName: 'Jordan Lee' },
          body: 'Change the color please.',
          createdAt: new Date('2026-07-01T10:00:00Z'),
        },
      ],
      commentCount: 1,
    }

    render(
      <PinPopover
        thread={thread}
        anchor={{ x: 100, y: 100 }}
        mode="review"
        onComment={async () => {}}
      />,
    )

    const list = screen.getByTestId('pin-popover-comments')
    expect(list).not.toHaveTextContent('Unknown')
    expect(list).toHaveTextContent('Jordan Lee')
  })

  it('renders the author name span with break-words so long names wrap', () => {
    const longName = 'Alexandrina Bartholomew-Christiansen'
    const thread: PinPopoverThread = {
      id: 't-long-name',
      pin: { kind: 'post' },
      status: 'open',
      firstComment: {
        id: 'c1',
        author: { kind: 'client', reviewerName: longName },
        body: 'A note.',
        createdAt: new Date('2026-07-01T10:00:00Z'),
      },
      comments: [
        {
          id: 'c1',
          author: { kind: 'client', reviewerName: longName },
          body: 'A note.',
          createdAt: new Date('2026-07-01T10:00:00Z'),
        },
      ],
      commentCount: 1,
    }

    render(
      <PinPopover
        thread={thread}
        anchor={{ x: 100, y: 100 }}
        mode="review"
        onComment={async () => {}}
      />,
    )

    const nameEl = screen.getByText(longName)
    expect(nameEl).toHaveClass('break-words')
    // Confirm no truncation class overrides the wrapping
    expect(nameEl).not.toHaveClass('truncate')
    expect(nameEl).not.toHaveClass('whitespace-nowrap')
  })
})

describe('PinPopover Cmd/Ctrl+Enter submits the reply', () => {
  afterEach(() => {
    cleanup()
  })

  it('submits the reply on Cmd+Enter (metaKey)', async () => {
    const onComment = vi.fn(async () => {})
    render(
      <PinPopover
        thread={makeThread()}
        anchor={{ x: 100, y: 100 }}
        mode="review"
        onComment={onComment}
      />,
    )

    const input = screen.getByTestId('pin-popover-input')
    fireEvent.change(input, { target: { value: 'Looks great' } })
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true })

    await waitFor(() => {
      expect(onComment).toHaveBeenCalledTimes(1)
    })
    expect(onComment).toHaveBeenCalledWith('Looks great', undefined)
  })

  it('submits the reply on Ctrl+Enter (ctrlKey)', async () => {
    const onComment = vi.fn(async () => {})
    render(
      <PinPopover
        thread={makeThread()}
        anchor={{ x: 100, y: 100 }}
        mode="review"
        onComment={onComment}
      />,
    )

    const input = screen.getByTestId('pin-popover-input')
    fireEvent.change(input, { target: { value: 'Ship it' } })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })

    await waitFor(() => {
      expect(onComment).toHaveBeenCalledWith('Ship it', undefined)
    })
  })

  it('does NOT submit on a plain Enter (newline, no modifier)', () => {
    const onComment = vi.fn(async () => {})
    render(
      <PinPopover
        thread={makeThread()}
        anchor={{ x: 100, y: 100 }}
        mode="review"
        onComment={onComment}
      />,
    )

    const input = screen.getByTestId('pin-popover-input')
    fireEvent.change(input, { target: { value: 'a note' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onComment).not.toHaveBeenCalled()
  })

  it('does NOT submit an empty reply on Cmd+Enter', () => {
    const onComment = vi.fn(async () => {})
    render(
      <PinPopover
        thread={makeThread()}
        anchor={{ x: 100, y: 100 }}
        mode="review"
        onComment={onComment}
      />,
    )

    const input = screen.getByTestId('pin-popover-input')
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true })

    expect(onComment).not.toHaveBeenCalled()
  })
})

describe('PinPopover follows its image pin when a scroll parent scrolls', () => {
  afterEach(() => {
    cleanup()
    document.querySelectorAll('[data-scroll-parent-fixture]').forEach((n) => n.remove())
  })

  function rect(left: number, top: number): DOMRect {
    return {
      left,
      top,
      width: 20,
      height: 20,
      right: left + 20,
      bottom: top + 20,
      x: left,
      y: top,
      toJSON() {
        return {}
      },
    } as DOMRect
  }

  it('re-anchors to the live badge on a scroll-parent scroll event', async () => {
    const threadId = 'thread-scroll'
    // A scrollable ancestor holding the pin badge (mirrors main.overflow-y-auto).
    const scroller = document.createElement('div')
    scroller.setAttribute('data-scroll-parent-fixture', '1')
    scroller.style.overflowY = 'auto'
    const badge = document.createElement('div')
    badge.setAttribute('data-testid', 'markup-overlay-pin')
    badge.setAttribute('data-thread-id', threadId)
    let badgeRect = rect(300, 400)
    badge.getBoundingClientRect = () => badgeRect
    scroller.appendChild(badge)
    document.body.appendChild(scroller)

    const thread: PinPopoverThread = {
      id: threadId,
      pin: { kind: 'image', x: 30, y: 40 },
      status: 'open',
      firstComment: {
        id: 'c1',
        author: { kind: 'am', userId: 'u1', name: 'Mollie' },
        body: 'fix this',
        createdAt: new Date('2026-06-01T10:00:00Z'),
      },
      comments: [
        {
          id: 'c1',
          author: { kind: 'am', userId: 'u1', name: 'Mollie' },
          body: 'fix this',
          createdAt: new Date('2026-06-01T10:00:00Z'),
        },
      ],
      commentCount: 1,
    }

    render(
      <PinPopover
        thread={thread}
        anchor={{ x: 310, y: 410 }}
        mode="internal"
        onComment={async () => {}}
        onClose={() => {}}
      />,
    )

    const pop = screen.getByTestId('pin-popover')
    const topBefore = pop.style.top

    // Badge scrolls up; a scroll event on its scroll PARENT re-anchors it.
    badgeRect = rect(300, 100)
    fireEvent.scroll(scroller)

    await waitFor(() => {
      expect(pop.style.top).not.toBe(topBefore)
    })
  })
})

describe('PinPopover auto-closes when its post scrolls out of view', () => {
  let ioCallback: IntersectionObserverCallback | null = null
  const observe = vi.fn()
  const disconnect = vi.fn()

  afterEach(() => {
    cleanup()
    ioCallback = null
    observe.mockClear()
    disconnect.mockClear()
    vi.unstubAllGlobals()
    document.querySelectorAll('[data-scroll-parent-fixture]').forEach((n) => n.remove())
  })

  function mockIntersectionObserver() {
    vi.stubGlobal(
      'IntersectionObserver',
      vi.fn(function (this: unknown, cb: IntersectionObserverCallback) {
        ioCallback = cb
        return { observe, disconnect, unobserve: vi.fn(), takeRecords: vi.fn() }
      }),
    )
  }

  function mountWithPostFixture(threadId: string) {
    const post = document.createElement('div')
    post.setAttribute('data-scroll-parent-fixture', '1')
    post.setAttribute('data-post-id', 'post-x')
    const badge = document.createElement('div')
    badge.setAttribute('data-testid', 'markup-overlay-pin')
    badge.setAttribute('data-thread-id', threadId)
    post.appendChild(badge)
    document.body.appendChild(post)
    return post
  }

  const thread = (id: string): PinPopoverThread => ({
    id,
    pin: { kind: 'image', x: 30, y: 40 },
    status: 'open',
    firstComment: {
      id: 'c1',
      author: { kind: 'am', userId: 'u1', name: 'Mollie' },
      body: 'fix this',
      createdAt: new Date('2026-06-01T10:00:00Z'),
    },
    comments: [
      {
        id: 'c1',
        author: { kind: 'am', userId: 'u1', name: 'Mollie' },
        body: 'fix this',
        createdAt: new Date('2026-06-01T10:00:00Z'),
      },
    ],
    commentCount: 1,
  })

  it('calls onClose when the post leaves the viewport (no draft)', () => {
    mockIntersectionObserver()
    const post = mountWithPostFixture('t-close')
    const onClose = vi.fn()
    render(
      <PinPopover
        thread={thread('t-close')}
        anchor={{ x: 10, y: 10 }}
        mode="internal"
        onComment={async () => {}}
        onClose={onClose}
      />,
    )
    expect(observe).toHaveBeenCalledWith(post)

    // Simulate the post fully scrolling out of view.
    ioCallback?.([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does NOT auto-close while an unsaved reply draft exists', async () => {
    const user = userEvent.setup()
    mockIntersectionObserver()
    mountWithPostFixture('t-draft')
    const onClose = vi.fn()
    render(
      <PinPopover
        thread={thread('t-draft')}
        anchor={{ x: 10, y: 10 }}
        mode="internal"
        onComment={async () => {}}
        onClose={onClose}
      />,
    )
    await user.type(screen.getByTestId('pin-popover-input'), 'wait, my reply')

    ioCallback?.([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver)
    expect(onClose).not.toHaveBeenCalled()
  })
})
