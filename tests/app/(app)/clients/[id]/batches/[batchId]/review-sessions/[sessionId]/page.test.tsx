import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

const routerRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  useRouter: () => ({ refresh: routerRefresh }),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
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
  canUploadPostMedia: vi.fn(),
  canComment: vi.fn(),
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

vi.mock('@/server/repositories/threads', () => ({
  listClientThreadsForBatch: vi.fn(),
}))

vi.mock('@/server/actions/threads', () => ({
  resolveThreadAction: vi.fn(),
  addCommentAction: vi.fn(),
  useCommentImageAsPostMediaAction: vi.fn(),
}))

vi.mock('@/server/actions/reviewSessions', () => ({
  acceptCaptionEditAction: vi.fn(),
  rejectCaptionEditAction: vi.fn(),
  startNextRoundAction: vi.fn(),
  markPostAddressedAction: vi.fn(),
  unmarkPostAddressedAction: vi.fn(),
}))

vi.mock('@/db/client', () => ({
  db: {
    magicLink: { findUnique: vi.fn() },
    magicLinkReviewer: { findUnique: vi.fn() },
    post: { findMany: vi.fn() },
  },
}))

vi.mock('@/server/repositories/activityEvents', () => ({
  listActivityForClient: vi.fn().mockResolvedValue([]),
  visibilityForViewer: vi.fn().mockReturnValue(['public', 'internal']),
}))

vi.mock('@/server/repositories/memberships', () => ({
  listMembershipsForOrg: vi.fn().mockResolvedValue([]),
}))

// Stub the ActivityThread client component.
vi.mock('@/components/activity/activity-thread', () => ({
  ActivityThread: (props: { hideComposer?: boolean }) => (
    <div
      data-component="activity-thread-stub"
      data-hide-composer={String(Boolean(props.hideComposer))}
    />
  ),
}))

// Stub MobileThreadFab — it imports base-ui Dialog which needs a real DOM.
// The internal chat now lives here (toggle popup), so expose the composer gate.
vi.mock('@/components/activity/mobile-thread-fab', () => ({
  MobileThreadFab: (props: { hideComposer?: boolean; showOnDesktop?: boolean }) => (
    <div
      data-testid="mobile-thread-fab-stub"
      data-hide-composer={String(Boolean(props.hideComposer))}
      data-show-on-desktop={String(Boolean(props.showOnDesktop))}
    />
  ),
}))

vi.mock('@/components/review/start-next-round-button', () => ({
  StartNextRoundButton: (props: { nextRound: number }) => (
    <div data-testid="start-next-round-button-stub" data-next-round={String(props.nextRound)} />
  ),
}))

// Stub the feedback shell so the test focuses on the server page's data
// assembly, not the client component internals.
vi.mock(
  '@/app/(app)/clients/[id]/batches/[batchId]/review-sessions/[sessionId]/review-feedback-shell',
  () => ({
    ReviewFeedbackShell: (props: {
      posts: Array<{
        postId: string
        postNumber: number
        verdict: string
        addressed: boolean
        captionAccepted?: boolean
        threads: Array<{ id: string; status: string; firstComment: { body: string } }>
      }>
      isDesigner: boolean
      canPostComment: boolean
      allAddressed: boolean
      isSuperseded: boolean
      startNextRoundSlot?: React.ReactNode
    }) => (
      <div data-testid="review-feedback-shell-stub">
        {/* Rail zone */}
        <div data-testid="review-feedback-rail">
          {props.posts.map((p) => (
            <div
              key={p.postId}
              data-testid={`rail-row-${p.postId}`}
              data-verdict={p.verdict}
              data-addressed={String(p.addressed)}
            >
              {p.threads.map((t) => (
                <div key={t.id} data-testid={`rail-thread-${t.id}`}>
                  <span>{t.firstComment.body}</span>
                </div>
              ))}
              {/* Caption-edit block: greyed success when accepted, action buttons when pending */}
              {p.verdict === 'caption_edited' && (
                p.captionAccepted ? (
                  <div data-testid={`rail-caption-accepted-${p.postId}`} />
                ) : (
                  <>
                    <div data-testid={`rail-accept-${p.postId}`} />
                    <div data-testid={`rail-reject-${p.postId}`} />
                  </>
                )
              )}
              {/* Mark addressed button — AM only, not designer */}
              {!props.isDesigner && (
                <div
                  data-testid={
                    p.addressed
                      ? `rail-mark-unaddressed-${p.postId}`
                      : `rail-mark-addressed-${p.postId}`
                  }
                />
              )}
            </div>
          ))}
        </div>
        {/* Canvas zone */}
        <div data-testid="review-posts-canvas">
          {props.posts.map((p) => (
            <div key={p.postId} data-testid={`canvas-post-${p.postId}`} />
          ))}
        </div>
        {/* Start next round */}
        {props.allAddressed && !props.isSuperseded && props.startNextRoundSlot}
      </div>
    ),
  }),
)

import ReviewSessionDetailPage from '@/app/(app)/clients/[id]/batches/[batchId]/review-sessions/[sessionId]/page'
import {
  requireClientViewer,
  canEditClients,
  canUploadPostMedia,
  canComment,
} from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import { findBatch } from '@/server/repositories/batches'
import { findSessionWithItems } from '@/server/repositories/reviewSessions'
import { listClientThreadsForBatch } from '@/server/repositories/threads'
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
      addressedAt: null,
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
      addressedAt: null,
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
      addressedAt: null,
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
    vi.mocked(listClientThreadsForBatch).mockResolvedValue(new Map())
    // Default both edit capabilities off; tests that need them opt in.
    vi.mocked(canEditClients).mockReturnValue(false)
    vi.mocked(canUploadPostMedia).mockReturnValue(false)
    vi.mocked(canComment).mockReturnValue(false)
  })

  it('renders the header + feedback shell with all posts in the batch', async () => {
    const { getByTestId } = await renderPage({
      id: 'client_1',
      batchId: 'batch_1',
      sessionId: 'session_1',
    })

    expect(getByTestId('review-session-header')).toBeTruthy()
    expect(getByTestId('review-feedback-shell-stub')).toBeTruthy()

    // All three posts appear: approved (post_a), changes_requested (post_b), caption_edited (post_c)
    expect(getByTestId('rail-row-post_a')).toBeTruthy()
    expect(getByTestId('rail-row-post_b')).toBeTruthy()
    expect(getByTestId('rail-row-post_c')).toBeTruthy()
  })

  it('approved post appears in the rail as a collapsed addressed row alongside actionable posts', async () => {
    // The default session has post_a=approved, post_b=changes_requested, post_c=caption_edited.
    // After the fix all three should appear in feedbackPosts; post_a must have
    // verdict='approved' and addressed=true so the rail can collapse it.
    const { getByTestId } = await renderPage({
      id: 'client_1',
      batchId: 'batch_1',
      sessionId: 'session_1',
    })

    // post_a (approved) must now appear — this is the collapsed approved row
    const rowA = getByTestId('rail-row-post_a')
    expect(rowA.getAttribute('data-verdict')).toBe('approved')
    expect(rowA.getAttribute('data-addressed')).toBe('true')

    // post_b (changes_requested, no addressedAt) stays expanded/actionable
    const rowB = getByTestId('rail-row-post_b')
    expect(rowB.getAttribute('data-verdict')).toBe('changes_requested')
    expect(rowB.getAttribute('data-addressed')).toBe('false')
  })

  it('redirects to access-denied when the user lacks access to the client', async () => {
    vi.mocked(findClientForUser).mockResolvedValue(null)

    await expect(
      renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/dashboard?denied=1')
  })

  it('redirects to access-denied when the magic link belongs to a different batch', async () => {
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
    ).rejects.toThrow('NEXT_REDIRECT:/dashboard?denied=1')
  })

  describe('addressed state derived from addressedAt column', () => {
    it('marks a changes_requested item as addressed when addressedAt is set', async () => {
      vi.mocked(findSessionWithItems).mockResolvedValue({
        ...mockSession,
        items: mockSession.items.map((it) =>
          it.id === 'item_b'
            ? { ...it, addressedAt: new Date('2026-05-15T13:00:00Z') }
            : it,
        ),
      } as never)

      const { getByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      })

      // post_b should be in the addressed state
      const rowB = getByTestId('rail-row-post_b')
      expect(rowB.getAttribute('data-addressed')).toBe('true')

      // post_c (caption_edited, addressedAt null) stays unaddressed
      const rowC = getByTestId('rail-row-post_c')
      expect(rowC.getAttribute('data-addressed')).toBe('false')
    })

    it('marks a caption_edited item as addressed when addressedAt is set', async () => {
      vi.mocked(findSessionWithItems).mockResolvedValue({
        ...mockSession,
        items: mockSession.items.map((it) =>
          it.id === 'item_c'
            ? { ...it, addressedAt: new Date('2026-05-15T13:30:00Z') }
            : it,
        ),
      } as never)

      const { getByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      })

      const rowC = getByTestId('rail-row-post_c')
      expect(rowC.getAttribute('data-addressed')).toBe('true')

      // changes_requested item with addressedAt null stays unaddressed
      const rowB = getByTestId('rail-row-post_b')
      expect(rowB.getAttribute('data-addressed')).toBe('false')
    })

    it('keeps items unaddressed when addressedAt is null and acceptedAsPostVersionId is null', async () => {
      const { getByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      })

      expect(getByTestId('rail-row-post_b').getAttribute('data-addressed')).toBe('false')
      expect(getByTestId('rail-row-post_c').getAttribute('data-addressed')).toBe('false')
    })

    it('treats acceptedAsPostVersionId as addressed (Accept Edit path)', async () => {
      vi.mocked(findSessionWithItems).mockResolvedValue({
        ...mockSession,
        items: mockSession.items.map((it) =>
          it.id === 'item_c'
            ? { ...it, acceptedAsPostVersionId: 'pv_new_1' }
            : it,
        ),
      } as never)

      const { getByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      })

      expect(getByTestId('rail-row-post_c').getAttribute('data-addressed')).toBe('true')
    })
  })

  function clientThread(id: string, status: 'open' | 'resolved') {
    return {
      id,
      status,
      pin: { kind: 'image' as const, x: 10, y: 20 },
      firstComment: {
        id: `${id}-c1`,
        author: { kind: 'client' as const, reviewerName: 'Sarah' },
        body: 'fix it',
        createdAt: new Date('2026-05-15T10:00:00Z'),
      },
      comments: [
        {
          id: `${id}-c1`,
          author: { kind: 'client' as const, reviewerName: 'Sarah' },
          body: 'fix it',
          createdAt: new Date('2026-05-15T10:00:00Z'),
        },
      ],
      commentCount: 1,
    }
  }

  it('shows an approved-but-pinned post in the shell (has a rail row)', async () => {
    // post_a is approved (filtered from items) but carries an open client pin.
    vi.mocked(listClientThreadsForBatch).mockResolvedValue(
      new Map([['post_a', [clientThread('th1', 'open')]]]),
    )
    const ui = await ReviewSessionDetailPage({
      params: Promise.resolve({ id: 'client_1', batchId: 'batch_1', sessionId: 'session_1' }),
    })
    const { getByTestId } = render(ui)
    // post_a now has a client thread so it should appear as an attention post
    expect(getByTestId('rail-row-post_a')).toBeTruthy()
  })

  it('moves a post to addressed once its client pins are all resolved', async () => {
    vi.mocked(listClientThreadsForBatch).mockResolvedValue(
      new Map([['post_a', [clientThread('th1', 'resolved')]]]),
    )
    const ui = await ReviewSessionDetailPage({
      params: Promise.resolve({ id: 'client_1', batchId: 'batch_1', sessionId: 'session_1' }),
    })
    const { getByTestId } = render(ui)
    // post_a has only resolved pins — it should be addressed
    const rowA = getByTestId('rail-row-post_a')
    expect(rowA.getAttribute('data-addressed')).toBe('true')
  })

  it('keeps Start next round hidden while a client pin is open', async () => {
    vi.mocked(listClientThreadsForBatch).mockResolvedValue(
      new Map([['post_a', [clientThread('th1', 'open')]]]),
    )
    const ui = await ReviewSessionDetailPage({
      params: Promise.resolve({ id: 'client_1', batchId: 'batch_1', sessionId: 'session_1' }),
    })
    const { queryByTestId } = render(ui)
    expect(queryByTestId('start-next-round-button-stub')).toBeNull()
  })

  it('stub renders mark-addressed and unmark-addressed buttons per addressed state', async () => {
    // item_b (changes_requested, addressedAt null) -> not addressed
    // item_c (caption_edited, addressedAt set) -> addressed
    vi.mocked(findSessionWithItems).mockResolvedValue({
      ...mockSession,
      items: mockSession.items.map((it) =>
        it.id === 'item_c'
          ? { ...it, addressedAt: new Date('2026-05-15T13:30:00Z') }
          : it,
      ),
    } as never)

    const { getByTestId, queryByTestId } = await renderPage({
      id: 'client_1',
      batchId: 'batch_1',
      sessionId: 'session_1',
    })

    // pending post_b -> mark-addressed button
    expect(getByTestId('rail-mark-addressed-post_b')).toBeTruthy()
    // addressed post_c -> unmark button
    expect(getByTestId('rail-mark-unaddressed-post_c')).toBeTruthy()
    // no unmark on the pending post
    expect(queryByTestId('rail-mark-unaddressed-post_b')).toBeNull()
  })

  describe('designer image-pin lane', () => {
    function imagePin(id: string, body: string) {
      return {
        id,
        status: 'open' as const,
        pin: { kind: 'image' as const, x: 10, y: 20 },
        firstComment: {
          id: `${id}-c1`,
          author: { kind: 'client' as const, reviewerName: 'Sarah' },
          body,
          createdAt: new Date('2026-05-15T10:00:00Z'),
        },
        comments: [
          {
            id: `${id}-c1`,
            author: { kind: 'client' as const, reviewerName: 'Sarah' },
            body,
            createdAt: new Date('2026-05-15T10:00:00Z'),
          },
        ],
        commentCount: 1,
      }
    }
    function captionPin(id: string, body: string) {
      return {
        id,
        status: 'open' as const,
        pin: { kind: 'caption' as const, from: 0, to: 4 },
        firstComment: {
          id: `${id}-c1`,
          author: { kind: 'client' as const, reviewerName: 'Sarah' },
          body,
          createdAt: new Date('2026-05-15T10:05:00Z'),
        },
        comments: [
          {
            id: `${id}-c1`,
            author: { kind: 'client' as const, reviewerName: 'Sarah' },
            body,
            createdAt: new Date('2026-05-15T10:05:00Z'),
          },
        ],
        commentCount: 1,
      }
    }

    const designerCtx = { ...mockCtx, role: 'designer' as const }

    function mockLaneThreads() {
      vi.mocked(listClientThreadsForBatch).mockResolvedValue(
        new Map([
          [
            'post_b',
            [
              imagePin('img_b', 'make logo bigger'),
              captionPin('cap_b', 'extra detail'),
            ],
          ],
          ['post_c', [captionPin('cap_c', 'caption only')]],
        ]),
      )
    }

    beforeEach(() => {
      vi.mocked(canUploadPostMedia).mockReturnValue(true)
      vi.mocked(canEditClients).mockReturnValue(false)
    })

    it('designer view shows only posts that have an image pin', async () => {
      vi.mocked(requireClientViewer).mockResolvedValue(designerCtx)
      mockLaneThreads()

      const { getByTestId, queryByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      })

      // post_b has an image pin -> visible
      expect(getByTestId('rail-row-post_b')).toBeTruthy()
      // post_c has only a caption pin -> hidden for designers
      expect(queryByTestId('rail-row-post_c')).toBeNull()
    })

    it('designer view shows thread comments for all pins on the visible post', async () => {
      vi.mocked(requireClientViewer).mockResolvedValue(designerCtx)
      mockLaneThreads()

      const { getByText } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      })

      // Both the image-pin comment AND the caption-pin comment on post_b show.
      expect(getByText(/make logo bigger/i)).toBeTruthy()
      expect(getByText(/extra detail/i)).toBeTruthy()
    })

    it('designer cannot see mark-addressed buttons', async () => {
      vi.mocked(requireClientViewer).mockResolvedValue(designerCtx)
      mockLaneThreads()

      const { queryAllByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      })

      // The shell stub suppresses mark-addressed for designers.
      expect(queryAllByTestId(/^rail-mark-addressed-/).length).toBe(0)
      expect(queryAllByTestId(/^rail-mark-unaddressed-/).length).toBe(0)
    })

    it('AM view still shows all attention posts (image + caption-only)', async () => {
      // mockCtx is account_manager by default.
      mockLaneThreads()

      const { getByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      })

      expect(getByTestId('rail-row-post_b')).toBeTruthy()
      expect(getByTestId('rail-row-post_c')).toBeTruthy()
    })
  })

  describe('new shell structure', () => {
    it('renders review-feedback-rail and review-posts-canvas', async () => {
      const { getByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      })

      expect(getByTestId('review-feedback-rail')).toBeTruthy()
      expect(getByTestId('review-posts-canvas')).toBeTruthy()
    })

    it('exposes the internal chat as a toggle popup (FAB), not a fixed rail', async () => {
      const { getByTestId, queryByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      })

      // No fixed right rail; the chat is the floating toggle (MobileThreadFab
      // with showOnDesktop), so the feedback rail + posts get the full width.
      expect(queryByTestId('review-internal-rail')).toBeNull()
      expect(getByTestId('mobile-thread-fab-stub')).toBeTruthy()
    })
  })

  describe('activity chat for internal revision pings', () => {
    it('renders the chat toggle popup on the page', async () => {
      const { getByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      })
      expect(getByTestId('mobile-thread-fab-stub')).toBeTruthy()
    })
  })

  describe('composer gate on the internal thread', () => {
    function threadStub(container: HTMLElement): HTMLElement {
      // The internal chat is now the MobileThreadFab toggle popup; the composer
      // gate (hideComposer = !canPostComment) is passed to it.
      return container.querySelector(
        '[data-testid="mobile-thread-fab-stub"]',
      ) as HTMLElement
    }

    it('shows the composer for comment-capable users (canComment true)', async () => {
      vi.mocked(canComment).mockReturnValue(true)
      const { container } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      })
      expect(threadStub(container).getAttribute('data-hide-composer')).toBe('false')
    })

    it('hides the composer for users without client.comment (canComment false)', async () => {
      vi.mocked(canComment).mockReturnValue(false)
      const { container } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      })
      expect(threadStub(container).getAttribute('data-hide-composer')).toBe('true')
    })

    it('shows the composer for a designer (designer has client.comment)', async () => {
      vi.mocked(requireClientViewer).mockResolvedValue({
        ...mockCtx,
        role: 'designer' as const,
      })
      vi.mocked(canComment).mockReturnValue(true)
      const { container } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      })
      expect(threadStub(container).getAttribute('data-hide-composer')).toBe('false')
    })
  })

  describe('superseded notice', () => {
    it('shows superseded notice when session is superseded', async () => {
      vi.mocked(findSessionWithItems).mockResolvedValue({
        ...mockSession,
        status: 'superseded' as const,
      } as never)

      const { getByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      })

      expect(getByTestId('superseded-notice')).toBeTruthy()
    })

    it('does not show superseded notice for active sessions', async () => {
      const { queryByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      })

      expect(queryByTestId('superseded-notice')).toBeNull()
    })
  })

  describe('verdict mapping in FeedbackPostVM', () => {
    it('maps changes_requested decision to changes_requested verdict', async () => {
      const { getByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      })

      expect(getByTestId('rail-row-post_b').getAttribute('data-verdict')).toBe('changes_requested')
    })

    it('maps caption_edited decision to caption_edited verdict', async () => {
      const { getByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      })

      expect(getByTestId('rail-row-post_c').getAttribute('data-verdict')).toBe('caption_edited')
    })

    it('maps pin-only posts (no ReviewItem) to none verdict', async () => {
      // post_d has no ReviewItem at all (not_reviewed / absent from session.items)
      // but carries a client thread — it should get verdict='none'.
      vi.mocked(db.post.findMany).mockResolvedValue([
        ...mockPosts,
        { id: 'post_d', postDate: new Date('2026-05-07'), caption: 'D original', mediaUrls: [] },
      ] as never)
      vi.mocked(listClientThreadsForBatch).mockResolvedValue(
        new Map([['post_d', [clientThread('th1', 'open')]]]),
      )
      const { getByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      })

      expect(getByTestId('rail-row-post_d').getAttribute('data-verdict')).toBe('none')
    })
  })

  describe('caption accepted state (acceptedAsPostVersionId → captionAccepted)', () => {
    it('renders greyed success block and hides accept/reject buttons when caption edit is accepted', async () => {
      // item_c is caption_edited; setting acceptedAsPostVersionId signals the AM
      // accepted the edit, which the page maps to captionAccepted=true in the VM.
      vi.mocked(findSessionWithItems).mockResolvedValue({
        ...mockSession,
        items: mockSession.items.map((it) =>
          it.id === 'item_c'
            ? { ...it, acceptedAsPostVersionId: 'pv_accepted_1' }
            : it,
        ),
      } as never)

      const { getByTestId, queryByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      })

      // Success block must be present — the page passed captionAccepted=true
      expect(getByTestId('rail-caption-accepted-post_c')).toBeTruthy()

      // Accept and Reject buttons must be absent — they belong to the pending state
      expect(queryByTestId('rail-accept-post_c')).toBeNull()
      expect(queryByTestId('rail-reject-post_c')).toBeNull()
    })
  })
})
