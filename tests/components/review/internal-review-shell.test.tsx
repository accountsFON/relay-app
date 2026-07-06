import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import {
  InternalReviewShell,
  type InternalReviewShellPost,
} from '@/components/review/internal-review-shell'
import { createThreadAction, addCommentAction } from '@/server/actions/threads'

// jsdom lacks scrollIntoView; ReviewPostCard calls it when edit mode opens.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/server/actions/threads', () => ({
  createThreadAction: vi.fn().mockResolvedValue({ id: 'thread-new' }),
  addCommentAction: vi.fn().mockResolvedValue({ id: 'comment-new' }),
  resolveThreadAction: vi.fn().mockResolvedValue(undefined),
  useCommentImageAsPostMediaAction: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/upload-comment-image', () => ({
  uploadCommentImage: vi
    .fn()
    .mockResolvedValue({ url: 'https://example.com/x.jpg', width: 10, height: 10 }),
}))

vi.mock('@/server/actions/posts', () => ({
  updatePostAction: vi.fn().mockResolvedValue(undefined),
}))

// Prop-capturing mock for ReviewPostCard. Renders a per-post marker so layout
// tests can assert on DOM presence, and records props so tests can fire
// callbacks (onCreatePin, onAppendThreadComment, etc.) directly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cardProps: Record<string, any> = {}
vi.mock('@/components/review/review-post-card', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ReviewPostCard: (props: any) => {
    cardProps[props.post.id] = props
    return <div data-testid={`card-${props.post.id}`}>{props.post.caption}</div>
  },
}))

function makePost(id: string, caption: string): InternalReviewShellPost {
  return {
    post: { id, caption, hashtags: [], mediaUrl: null },
  }
}

const POSTS: InternalReviewShellPost[] = [
  makePost('post-1', 'Original caption for post 1'),
  makePost('post-2', 'Original caption for post 2'),
]

const BASE_PROPS = {
  batchId: 'batch-1',
  clientName: 'Test Client',
  clientAvatarUrl: null,
  reviewerName: 'Test AM',
  posts: POSTS,
}

function renderShell(overrides: Partial<typeof BASE_PROPS & {
  canEditCaption?: boolean
  canReplaceImage?: boolean
  locked?: boolean
  amControlsSlot?: React.ReactNode
  designerControlsSlot?: React.ReactNode
}> = {}) {
  return render(<InternalReviewShell {...BASE_PROPS} {...overrides} />)
}

describe('InternalReviewShell', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    for (const key of Object.keys(cardProps)) {
      delete cardProps[key]
    }
  })

  it('renders no Submit bar, progress bar, or Approve-all', () => {
    renderShell()
    expect(screen.queryByRole('button', { name: /submit review/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/approve all/i)).not.toBeInTheDocument()
  })

  it('renders the rail and one canvas card per post', () => {
    renderShell()
    expect(screen.getAllByTestId('internal-rail-row').length).toBeGreaterThan(0)
    expect(screen.getByTestId('card-post-1')).toBeInTheDocument()
  })

  it('a pin drop still routes through createThreadAction (notification path kept)', async () => {
    renderShell()
    await act(async () => {
      await cardProps['post-1'].onCreatePin({ kind: 'image', xPct: 1, yPct: 1 }, 'tighten crop')
    })
    expect(createThreadAction).toHaveBeenCalledWith(expect.objectContaining({ postId: 'post-1', body: 'tighten crop' }))
  })

  it('a thread reply still routes through addCommentAction', async () => {
    renderShell()
    await act(async () => {
      await cardProps['post-1'].onAppendThreadComment('thread-1', 'looks good')
    })
    expect(addCommentAction).toHaveBeenCalledWith(expect.objectContaining({ threadId: 'thread-1', body: 'looks good' }))
  })

  it('renders the AM control slot when provided', () => {
    renderShell({ amControlsSlot: <button>Request changes</button> })
    expect(screen.getByRole('button', { name: 'Request changes' })).toBeInTheDocument()
  })

  it('passes canReplaceImage=true to every card when canReplaceImage=true', () => {
    renderShell({ canReplaceImage: true })
    for (const post of POSTS) {
      expect(cardProps[post.post.id].canReplaceImage).toBe(true)
    }
  })

  it('defaults canReplaceImage to false on every card when not provided', () => {
    renderShell()
    for (const post of POSTS) {
      expect(cardProps[post.post.id].canReplaceImage).toBe(false)
    }
  })

  describe('locked relay (completed step)', () => {
    afterEach(() => {
      vi.restoreAllMocks()
      vi.clearAllMocks()
      for (const key of Object.keys(cardProps)) {
        delete cardProps[key]
      }
    })

    it('passes canEditCaption=false to every card when locked=true, even if canEditCaption prop is true', () => {
      renderShell({ canEditCaption: true, locked: true })
      for (const post of POSTS) {
        expect(cardProps[post.post.id].canEditCaption).toBe(false)
      }
    })

    it('passes onUploadImage=undefined to every card when locked=true, even if reviewerUserId is set', () => {
      renderShell({ locked: true, ...{ reviewerUserId: 'user-1' } })
      for (const post of POSTS) {
        expect(cardProps[post.post.id].onUploadImage).toBeUndefined()
      }
    })

    it('still passes onCreatePin to every card when locked (pins/markup stay open)', () => {
      renderShell({ locked: true })
      for (const post of POSTS) {
        expect(cardProps[post.post.id].onCreatePin).toBeDefined()
      }
    })

    it('still passes onAppendThreadComment when locked (comments stay open)', () => {
      renderShell({ locked: true })
      for (const post of POSTS) {
        expect(cardProps[post.post.id].onAppendThreadComment).toBeDefined()
      }
    })
  })
})

describe('InternalReviewShell markup layout', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    for (const key of Object.keys(cardProps)) {
      delete cardProps[key]
    }
  })

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  const basePosts = [
    { post: { id: 'p1', caption: 'one', hashtags: [], mediaUrl: '/a.jpg' }, threads: [] },
    { post: { id: 'p2', caption: 'two', hashtags: [], mediaUrl: null }, threads: [] },
  ]

  function renderLayoutShell() {
    return render(
      <InternalReviewShell
        batchId="b1"
        clientName="Acme"
        reviewerName="Jane AM"
        reviewerUserId="u1"
        posts={basePosts}
      />,
    )
  }

  it('renders the rail with one row per post', () => {
    renderLayoutShell()
    expect(screen.getAllByTestId('internal-rail-row')).toHaveLength(2)
  })

  it('scrolls the canvas to a post when its rail row is clicked', () => {
    renderLayoutShell()
    fireEvent.click(screen.getAllByTestId('internal-rail-row')[1])
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('still renders one canvas card per post', () => {
    renderLayoutShell()
    expect(screen.getByTestId('card-p1')).toBeInTheDocument()
    expect(screen.getByTestId('card-p2')).toBeInTheDocument()
  })
})

describe('InternalReviewShell rail bylines + labels', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    for (const key of Object.keys(cardProps)) {
      delete cardProps[key]
    }
  })

  const LONG_BODY =
    'This is a very long piece of reviewer feedback that easily runs well beyond sixty characters so we can prove the checklist label is not truncated at all.'

  const postsWithThreads: InternalReviewShellPost[] = [
    {
      post: { id: 'p1', caption: 'cap', hashtags: [], mediaUrl: null },
      threads: [
        {
          id: 't-am',
          status: 'open',
          pin: { kind: 'post' },
          firstComment: {
            id: 'c1',
            author: { kind: 'am', userId: 'u1', name: 'Author Alex' },
            body: LONG_BODY,
            createdAt: new Date(),
          },
          comments: [],
          commentCount: 1,
        },
        {
          id: 't-client',
          status: 'open',
          pin: { kind: 'image', x: 10, y: 20 },
          firstComment: {
            id: 'c2',
            author: { kind: 'client', reviewerName: 'Casey Client' },
            body: 'Short client note',
            createdAt: new Date(),
          },
          comments: [],
          commentCount: 1,
        },
      ],
    },
  ]

  function renderBylineShell() {
    return render(
      <InternalReviewShell
        batchId="b1"
        clientName="Acme"
        reviewerName="Rev Person"
        posts={postsWithThreads}
      />,
    )
  }

  it('shows the AM account name and the client magic-link name as rail bylines', () => {
    renderBylineShell()
    expect(screen.getByText('Author Alex')).toBeInTheDocument()
    expect(screen.getByText('Casey Client')).toBeInTheDocument()
  })

  it('renders a long thread label in full (no 60-char truncation)', () => {
    renderBylineShell()
    expect(screen.getByText(LONG_BODY)).toBeInTheDocument()
  })
})
