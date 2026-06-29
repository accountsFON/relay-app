import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock('@/server/auth/access', () => ({
  // Real redirectAccessDenied() calls redirect(), which throws to halt the
  // render. Mirror that so the page short-circuits like in production.
  redirectAccessDenied: vi.fn(() => {
    throw new Error('NEXT_REDIRECT:/dashboard?denied=1')
  }),
}))

vi.mock('@/server/middleware/permissions', () => ({
  requireClientViewer: vi.fn(),
  canEditClients: vi.fn(),
}))

vi.mock('@/server/repositories/clients', () => ({
  findClientForUser: vi.fn(),
}))

vi.mock('@/server/repositories/batches', () => ({
  findBatch: vi.fn(),
}))

vi.mock('@/server/repositories/threads', () => ({
  listThreadsForBatch: vi.fn(),
}))

vi.mock('@/server/services/approval', () => ({
  derivePostApprovalForBatch: vi.fn(),
}))

// The internal review session loader (resume-or-create) lives in the repo.
vi.mock('@/server/repositories/reviewSessions', () => ({
  findActiveSession: vi.fn(),
  startSession: vi.fn(),
}))

// The page fetches the internal @-mention roster for the composers; stub it so
// the page render doesn't reach into db.client (its own logic is unit-tested in
// tests/server/lib/internalMentionRoster.test.ts).
vi.mock('@/server/lib/internalMentionRoster', () => ({
  internalMentionRosterForClient: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/db/client', () => ({
  db: {
    post: {
      findMany: vi.fn(),
    },
    postComment: {
      count: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    reviewItem: {
      findMany: vi.fn(),
    },
  },
}))

// PreviewSubmitButton is a client component with hooks ('use client'). Stub it
// so the server-side page render under jsdom doesn't try to mount the real
// component (its action surface is covered by the integration tests).
vi.mock('@/components/notifications/preview-submit-button', () => ({
  PreviewSubmitButton: (props: {
    batchId: string
    designerName: string | null
    initialCommentCount: number
  }) => (
    <div
      data-testid="preview-submit-button-stub"
      data-batch-id={props.batchId}
      data-designer-name={props.designerName ?? ''}
      data-initial-comment-count={String(props.initialCommentCount)}
    />
  ),
}))

// The read-only viewer feed (client component). Stubbed so the server-side
// page render doesn't hydrate the real FeedShell tree.
vi.mock(
  '@/app/(app)/clients/[id]/batches/[batchId]/preview/preview-page-shell',
  () => ({
    PreviewPageShell: (props: {
      client: { id: string; name: string }
      posts: ReadonlyArray<{ id: string }>
      canEdit: boolean
    }) => (
      <div
        data-testid="preview-page-shell-stub"
        data-client-id={props.client.id}
        data-can-edit={String(props.canEdit)}
      >
        {props.posts.map((p) => (
          <div key={p.id} data-testid="preview-shell-post" data-post-id={p.id} />
        ))}
      </div>
    ),
  }),
)

// The AM verdict surface (client component). Stubbed to expose the props the
// page wires up: batchId, the session items, and one node per post.
vi.mock('@/components/review/internal-review-shell', () => ({
  InternalReviewShell: (props: {
    batchId: string
    sessionStatus: string | null
    posts: ReadonlyArray<{ post: { id: string } }>
    initialItems: ReadonlyArray<{ postId: string; decision: string }>
  }) => (
    <div
      data-testid="internal-review-shell-stub"
      data-batch-id={props.batchId}
      data-session-status={props.sessionStatus ?? ''}
      data-item-count={String(props.initialItems.length)}
    >
      {props.posts.map((p) => (
        <div
          key={p.post.id}
          data-testid="internal-shell-post"
          data-post-id={p.post.id}
        />
      ))}
      {props.initialItems.map((it) => (
        <div
          key={it.postId}
          data-testid="internal-shell-item"
          data-post-id={it.postId}
          data-decision={it.decision}
        />
      ))}
    </div>
  ),
}))

import BatchPreviewPage from '@/app/(app)/clients/[id]/batches/[batchId]/preview/page'
import {
  requireClientViewer,
  canEditClients,
} from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import { findBatch } from '@/server/repositories/batches'
import { listThreadsForBatch } from '@/server/repositories/threads'
import { derivePostApprovalForBatch } from '@/server/services/approval'
import {
  findActiveSession,
  startSession,
} from '@/server/repositories/reviewSessions'
import { db } from '@/db/client'

const mockCtx = {
  userId: 'user_clerk_1',
  orgId: 'org_clerk_1',
  role: 'account_manager' as const,
  plan: 'agency' as const,
  organizationDbId: 'org_db_1',
  userDbId: 'user_db_1',
  avatarUrl: null,
  platformOwner: false,
  linkedClientId: null,
  permissionOverrides: null,
  roleDefaults: {},
}

const mockClient = {
  id: 'client_1',
  name: 'Demo Client',
  organizationId: 'org_db_1',
}

const mockBatch = {
  id: 'batch_1',
  clientId: 'client_1',
  label: 'May 2026',
}

const mockPosts = [
  {
    id: 'post_a',
    postDate: new Date('2026-05-01'),
    caption: 'First post caption',
    hashtags: ['one'],
    mediaUrls: ['https://example.com/a.jpg'],
  },
  {
    id: 'post_b',
    postDate: new Date('2026-05-03'),
    caption: 'Second post caption',
    hashtags: ['two'],
    mediaUrls: [],
  },
]

const mockSession = {
  id: 'session_1',
  status: 'in_progress' as const,
}

async function renderPage(params: { id: string; batchId: string }) {
  const ui = await BatchPreviewPage({ params: Promise.resolve(params) })
  return render(ui)
}

describe('BatchPreviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireClientViewer).mockResolvedValue(mockCtx)
    vi.mocked(canEditClients).mockReturnValue(true)
    vi.mocked(findClientForUser).mockResolvedValue(mockClient as never)
    vi.mocked(findBatch).mockResolvedValue(mockBatch as never)
    vi.mocked(db.post.findMany).mockResolvedValue(mockPosts as never)
    vi.mocked(db.postComment.count).mockResolvedValue(0 as never)
    vi.mocked(db.user.findUnique).mockResolvedValue(null as never)
    vi.mocked(db.reviewItem.findMany).mockResolvedValue([] as never)
    vi.mocked(listThreadsForBatch).mockResolvedValue(new Map())
    vi.mocked(derivePostApprovalForBatch).mockResolvedValue({
      ready: 2,
      pending: 0,
    })
    vi.mocked(findActiveSession).mockResolvedValue(mockSession as never)
    vi.mocked(startSession).mockResolvedValue(mockSession as never)
  })

  it('renders the AM verdict surface with one entry per post for an editor', async () => {
    const { getAllByTestId, getByTestId } = await renderPage({
      id: 'client_1',
      batchId: 'batch_1',
    })

    const shell = getByTestId('internal-review-shell-stub')
    expect(shell.dataset.batchId).toBe('batch_1')

    const postNodes = getAllByTestId('internal-shell-post')
    expect(postNodes.map((n) => n.dataset.postId)).toEqual([
      'post_a',
      'post_b',
    ])
  })

  it('resumes the active internal session and passes its items to the shell', async () => {
    vi.mocked(db.reviewItem.findMany).mockResolvedValue([
      {
        id: 'item_1',
        postId: 'post_a',
        decision: 'approved',
        comment: null,
        suggestedCaption: null,
        acceptedAsPostVersionId: null,
        updatedSinceLastReview: false,
        lastReviewedVersionId: null,
        reviewedAt: new Date('2026-05-02'),
        addressedAt: null,
      },
    ] as never)

    const { getByTestId, getAllByTestId } = await renderPage({
      id: 'client_1',
      batchId: 'batch_1',
    })

    expect(getByTestId('internal-review-shell-stub').dataset.itemCount).toBe('1')
    // The active session was resumed, not freshly created.
    expect(findActiveSession).toHaveBeenCalledWith({
      kind: 'internal',
      batchId: 'batch_1',
      reviewerUserId: 'user_db_1',
    })
    expect(startSession).not.toHaveBeenCalled()

    const item = getAllByTestId('internal-shell-item')[0]
    expect(item.dataset.postId).toBe('post_a')
    expect(item.dataset.decision).toBe('approved')
  })

  it('creates an internal session when none is active', async () => {
    vi.mocked(findActiveSession).mockResolvedValue(null)

    await renderPage({ id: 'client_1', batchId: 'batch_1' })

    expect(startSession).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'internal',
        batchId: 'batch_1',
        reviewerUserId: 'user_db_1',
      }),
    )
  })

  it('shows the read-only feed (not the verdict surface) for a non-editor viewer', async () => {
    vi.mocked(canEditClients).mockReturnValue(false)

    const { getByTestId, queryByTestId } = await renderPage({
      id: 'client_1',
      batchId: 'batch_1',
    })

    // Viewers keep the existing read-only PreviewPageShell.
    expect(getByTestId('preview-page-shell-stub')).toBeInTheDocument()
    expect(queryByTestId('internal-review-shell-stub')).not.toBeInTheDocument()
    // No internal session is created for a viewer.
    expect(startSession).not.toHaveBeenCalled()
  })

  it('redirects to access-denied when the user lacks access to the client', async () => {
    vi.mocked(findClientForUser).mockResolvedValue(null)

    await expect(
      renderPage({ id: 'client_1', batchId: 'batch_1' }),
    ).rejects.toThrow('NEXT_REDIRECT:/dashboard?denied=1')
  })
})
