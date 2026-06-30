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
