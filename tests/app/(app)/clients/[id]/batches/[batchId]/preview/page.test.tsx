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
  },
}))

// PreviewSubmitButton is a client component with hooks ('use client'). Stub
// it so the server-side page render under jsdom doesn't try to mount the
// real component (its action surface is covered by the integration tests).
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

// The preview shell is a client component with hooks ('use client'). Stub it
// so the server-side page render under jsdom doesn't try to hydrate the real
// FeedShell / FeedPost tree (those are already exercised by their own
// component tests).
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

import BatchPreviewPage from '@/app/(app)/clients/[id]/batches/[batchId]/preview/page'
import {
  requireClientViewer,
  canEditClients,
} from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import { findBatch } from '@/server/repositories/batches'
import { listThreadsForBatch } from '@/server/repositories/threads'
import { derivePostApprovalForBatch } from '@/server/services/approval'
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
    vi.mocked(listThreadsForBatch).mockResolvedValue(new Map())
    vi.mocked(derivePostApprovalForBatch).mockResolvedValue({
      ready: 2,
      pending: 0,
    })
  })

  it('renders the shell with one entry per post in the batch', async () => {
    const { getAllByTestId, getByTestId } = await renderPage({
      id: 'client_1',
      batchId: 'batch_1',
    })

    const shell = getByTestId('preview-page-shell-stub')
    expect(shell.dataset.clientId).toBe('client_1')

    const postNodes = getAllByTestId('preview-shell-post')
    expect(postNodes.map((n) => n.dataset.postId)).toEqual([
      'post_a',
      'post_b',
    ])
  })

  it('redirects to access-denied when the user lacks access to the client', async () => {
    vi.mocked(findClientForUser).mockResolvedValue(null)

    await expect(
      renderPage({ id: 'client_1', batchId: 'batch_1' }),
    ).rejects.toThrow('NEXT_REDIRECT:/dashboard?denied=1')
  })

  it('passes canEdit=true to the shell so AM-only review controls render', async () => {
    vi.mocked(canEditClients).mockReturnValue(true)

    const { getByTestId } = await renderPage({
      id: 'client_1',
      batchId: 'batch_1',
    })

    expect(getByTestId('preview-page-shell-stub').dataset.canEdit).toBe('true')
  })
})
