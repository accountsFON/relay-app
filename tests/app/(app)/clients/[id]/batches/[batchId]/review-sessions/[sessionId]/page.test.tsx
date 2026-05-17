import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock('@/server/middleware/permissions', () => ({
  requireClientViewer: vi.fn(),
}))

vi.mock('@/server/repositories/clients', () => ({
  findClientForUser: vi.fn(),
}))

vi.mock('@/server/repositories/batches', () => ({
  findBatch: vi.fn(),
}))

vi.mock('@/server/repositories/reviewSessions', () => ({
  findSessionWithItems: vi.fn(),
}))

vi.mock('@/db/client', () => ({
  db: {
    magicLink: { findUnique: vi.fn() },
    magicLinkReviewer: { findUnique: vi.fn() },
    post: { findMany: vi.fn() },
  },
}))

// Stub the client components so the server-side page render under jsdom
// doesn't attempt to hydrate the real React Transition / useTransition trees.
vi.mock('@/components/review/review-item-row', () => ({
  ReviewItemRow: (props: {
    item: { id: string; decision: string }
    postNumber: number
    mode: string
  }) => (
    <div
      data-testid={`review-item-row-stub-${props.item.id}`}
      data-decision={props.item.decision}
      data-post-number={String(props.postNumber)}
      data-mode={props.mode}
    />
  ),
}))

vi.mock('@/components/review/start-next-round-button', () => ({
  StartNextRoundButton: (props: { nextRound: number }) => (
    <div data-testid="start-next-round-button-stub" data-next-round={String(props.nextRound)} />
  ),
}))

import ReviewSessionDetailPage from '@/app/(app)/clients/[id]/batches/[batchId]/review-sessions/[sessionId]/page'
import { requireClientViewer } from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import { findBatch } from '@/server/repositories/batches'
import { findSessionWithItems } from '@/server/repositories/reviewSessions'
import { db } from '@/db/client'

const mockCtx = {
  userId: 'user_clerk_1',
  orgId: 'org_clerk_1',
  role: 'account_manager' as const,
  plan: 'agency' as const,
  organizationDbId: 'org_db_1',
  userDbId: 'user_db_1',
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

const mockSession = {
  id: 'session_1',
  magicLinkId: 'ml_1',
  reviewerId: 'reviewer_1',
  status: 'submitted' as const,
  round: 1,
  startedAt: new Date('2026-05-15T10:00:00Z'),
  submittedAt: new Date('2026-05-15T12:00:00Z'),
  submittedSummary: {
    approved: 1,
    changesRequested: 1,
    captionEdited: 1,
    totalPosts: 3,
  },
  items: [
    {
      id: 'item_a',
      postId: 'post_a',
      decision: 'approved' as const,
      comment: null,
      suggestedCaption: null,
      acceptedAsPostVersionId: null,
      updatedSinceLastReview: false,
      lastReviewedVersionId: null,
      reviewedAt: new Date('2026-05-15T11:00:00Z'),
    },
    {
      id: 'item_b',
      postId: 'post_b',
      decision: 'changes_requested' as const,
      comment: 'Please rework intro.',
      suggestedCaption: null,
      acceptedAsPostVersionId: null,
      updatedSinceLastReview: false,
      lastReviewedVersionId: null,
      reviewedAt: new Date('2026-05-15T11:15:00Z'),
    },
    {
      id: 'item_c',
      postId: 'post_c',
      decision: 'caption_edited' as const,
      comment: null,
      suggestedCaption: 'Suggested caption text.',
      acceptedAsPostVersionId: null,
      updatedSinceLastReview: false,
      lastReviewedVersionId: null,
      reviewedAt: new Date('2026-05-15T11:30:00Z'),
    },
  ],
}

const mockMagicLink = {
  id: 'ml_1',
  batchId: 'batch_1',
  defaultReviewerName: 'Default Reviewer',
  defaultReviewerEmail: 'default@example.com',
}

const mockReviewer = {
  id: 'reviewer_1',
  name: 'Real Reviewer',
  email: 'real@example.com',
}

const mockPosts = [
  {
    id: 'post_a',
    postDate: new Date('2026-05-01'),
    caption: 'A original',
    mediaUrls: [],
  },
  {
    id: 'post_b',
    postDate: new Date('2026-05-03'),
    caption: 'B original',
    mediaUrls: [],
  },
  {
    id: 'post_c',
    postDate: new Date('2026-05-05'),
    caption: 'C original',
    mediaUrls: [],
  },
]

async function renderPage(params: {
  id: string
  batchId: string
  sessionId: string
}) {
  const ui = await ReviewSessionDetailPage({ params: Promise.resolve(params) })
  return render(ui)
}

describe('ReviewSessionDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireClientViewer).mockResolvedValue(mockCtx)
    vi.mocked(findClientForUser).mockResolvedValue(mockClient as never)
    vi.mocked(findBatch).mockResolvedValue(mockBatch as never)
    vi.mocked(findSessionWithItems).mockResolvedValue(mockSession as never)
    vi.mocked(db.magicLink.findUnique).mockResolvedValue(mockMagicLink as never)
    vi.mocked(db.magicLinkReviewer.findUnique).mockResolvedValue(mockReviewer as never)
    vi.mocked(db.post.findMany).mockResolvedValue(mockPosts as never)
  })

  it('renders the header + one row per non-approved item (omits approved)', async () => {
    const { getByTestId, queryByTestId } = await renderPage({
      id: 'client_1',
      batchId: 'batch_1',
      sessionId: 'session_1',
    })

    expect(getByTestId('review-session-header')).toBeTruthy()
    // approved item should NOT render a row
    expect(queryByTestId('review-item-row-stub-item_a')).toBeNull()
    // changes_requested + caption_edited should render
    expect(getByTestId('review-item-row-stub-item_b')).toBeTruthy()
    expect(getByTestId('review-item-row-stub-item_c')).toBeTruthy()
  })

  it('notFounds when the user lacks access to the client', async () => {
    vi.mocked(findClientForUser).mockResolvedValue(null)

    await expect(
      renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('notFounds when the magic link belongs to a different batch', async () => {
    vi.mocked(db.magicLink.findUnique).mockResolvedValue({
      ...mockMagicLink,
      batchId: 'other_batch',
    } as never)

    await expect(
      renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
