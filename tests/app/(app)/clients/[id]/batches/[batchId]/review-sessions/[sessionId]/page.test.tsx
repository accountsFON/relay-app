import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'

const routerRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  useRouter: () => ({ refresh: routerRefresh }),
}))

// ReviewAttentionCard's MediaUpload control imports @vercel/blob/client; stub
// it so the real card can render under jsdom without the blob SDK.
vi.mock('@vercel/blob/client', () => ({
  upload: vi.fn(),
}))

vi.mock('@/server/actions/posts', () => ({
  updatePostAction: vi.fn(),
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
// The page imports thread server actions; stub the module so the node/jsdom
// test does not pull server-only deps.
vi.mock('@/server/actions/threads', () => ({
  resolveThreadAction: vi.fn(),
  addCommentAction: vi.fn(),
}))
vi.mock('@/server/actions/reviewSessions', () => ({
  acceptCaptionEditAction: vi.fn(),
  rejectCaptionEditAction: vi.fn(),
  startNextRoundAction: vi.fn(),
  markPostAddressedAction: vi.fn(),
  unmarkPostAddressedAction: vi.fn(),
}))
vi.mock('@/components/review/review-pinned-post', () => ({
  ReviewPinnedPost: (props: {
    postId: string
    threads?: ReadonlyArray<{
      id: string
      firstComment: { body: string }
    }>
  }) => (
    <div data-testid={`review-pinned-post-stub-${props.postId}`}>
      {(props.threads ?? []).map((t) => (
        <span key={t.id} data-testid={`pin-comment-${t.id}`}>
          {t.firstComment.body}
        </span>
      ))}
    </div>
  ),
}))
vi.mock('@/components/review/mark-addressed-button', () => ({
  MarkAddressedButton: (props: { testId?: string }) => (
    <div data-testid={props.testId ?? 'mark-post-addressed-button'} />
  ),
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

vi.mock('@/components/activity/activity-thread', () => ({
  ActivityThread: (props: { hideComposer?: boolean }) => (
    <div
      data-component="activity-thread-stub"
      data-hide-composer={String(Boolean(props.hideComposer))}
    />
  ),
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
import { updatePostAction } from '@/server/actions/posts'
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
    it('moves a changes_requested item to addressed when addressedAt is set', async () => {
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

      // The row still renders (it's just in a different bucket).
      const row = getByTestId('review-item-row-stub-item_b')
      expect(row.getAttribute('data-mode')).toBe('addressed')

      // The other non-approved item (caption_edited with addressedAt null) stays pending.
      const captionRow = getByTestId('review-item-row-stub-item_c')
      expect(captionRow.getAttribute('data-mode')).toBe('pending')
    })

    it('moves a caption_edited item to addressed when addressedAt is set', async () => {
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

      const captionRow = getByTestId('review-item-row-stub-item_c')
      expect(captionRow.getAttribute('data-mode')).toBe('addressed')

      // changes_requested item with addressedAt null stays pending.
      const changesRow = getByTestId('review-item-row-stub-item_b')
      expect(changesRow.getAttribute('data-mode')).toBe('pending')
    })

    it('keeps items pending when addressedAt is null and acceptedAsPostVersionId is null', async () => {
      // Default mockSession has both items with addressedAt: null — confirm they're pending.
      const { getByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      })

      expect(
        getByTestId('review-item-row-stub-item_b').getAttribute('data-mode'),
      ).toBe('pending')
      expect(
        getByTestId('review-item-row-stub-item_c').getAttribute('data-mode'),
      ).toBe('pending')
    })

    it('still treats acceptedAsPostVersionId as addressed (Accept Edit path)', async () => {
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

      expect(
        getByTestId('review-item-row-stub-item_c').getAttribute('data-mode'),
      ).toBe('addressed')
    })
  })

  function clientThread(id: string, status: 'open' | 'resolved') {
    return {
      id,
      status,
      pin: { kind: 'image' as const, x: 10, y: 20 },
      firstComment: {
        author: { kind: 'client' as const, reviewerName: 'Sarah' },
        body: 'fix it',
        createdAt: new Date('2026-05-15T10:00:00Z'),
      },
      commentCount: 1,
    }
  }

  it('shows an approved-but-pinned post in the pending section', async () => {
    // post_a is approved (filtered from items) but carries an open client pin.
    vi.mocked(listClientThreadsForBatch).mockResolvedValue(
      new Map([['post_a', [clientThread('th1', 'open')]]]),
    )
    const ui = await ReviewSessionDetailPage({
      params: Promise.resolve({ id: 'client_1', batchId: 'batch_1', sessionId: 'session_1' }),
    })
    const { getByTestId } = render(ui)
    expect(getByTestId('review-pinned-post-stub-post_a')).toBeTruthy()
  })

  it('moves a post to addressed once its client pins are all resolved', async () => {
    vi.mocked(listClientThreadsForBatch).mockResolvedValue(
      new Map([['post_a', [clientThread('th1', 'resolved')]]]),
    )
    const ui = await ReviewSessionDetailPage({
      params: Promise.resolve({ id: 'client_1', batchId: 'batch_1', sessionId: 'session_1' }),
    })
    const { queryByTestId, getByText } = render(ui)
    expect(queryByTestId('review-pinned-post-stub-post_a')).toBeTruthy()
    expect(getByText(/Already addressed/)).toBeTruthy()
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

  it('pending cards render mark-post-addressed-button and addressed cards render unmark-post-addressed-button', async () => {
    // item_b (changes_requested, addressedAt null) -> pending
    // item_c (caption_edited, addressedAt set) -> addressed
    vi.mocked(findSessionWithItems).mockResolvedValue({
      ...mockSession,
      items: mockSession.items.map((it) =>
        it.id === 'item_c'
          ? { ...it, addressedAt: new Date('2026-05-15T13:30:00Z') }
          : it,
      ),
    } as never)

    const { getAllByTestId, queryAllByTestId } = await renderPage({
      id: 'client_1',
      batchId: 'batch_1',
      sessionId: 'session_1',
    })

    // pending card (item_b) should have the mark-addressed button
    expect(getAllByTestId('mark-post-addressed-button').length).toBeGreaterThanOrEqual(1)
    // addressed card (item_c) should have the unmark-addressed button
    expect(getAllByTestId('unmark-post-addressed-button').length).toBeGreaterThanOrEqual(1)
    // no un-address button on pending cards
    const unmarkBtns = queryAllByTestId('unmark-post-addressed-button')
    expect(unmarkBtns.length).toBe(1)
  })

  describe('designer image-pin lane (Task 9)', () => {
    // post_b carries an image pin ("make logo bigger") + a caption pin
    // ("extra detail"). post_c carries only a caption pin ("caption only").
    function imagePin(id: string, body: string) {
      return {
        id,
        status: 'open' as const,
        pin: { kind: 'image' as const, x: 10, y: 20 },
        firstComment: {
          author: { kind: 'client' as const, reviewerName: 'Sarah' },
          body,
          createdAt: new Date('2026-05-15T10:00:00Z'),
        },
        commentCount: 1,
      }
    }
    function captionPin(id: string, body: string) {
      return {
        id,
        status: 'open' as const,
        pin: { kind: 'caption' as const, from: 0, to: 4 },
        firstComment: {
          author: { kind: 'client' as const, reviewerName: 'Sarah' },
          body,
          createdAt: new Date('2026-05-15T10:05:00Z'),
        },
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
      // Designers can upload images but cannot edit captions.
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
      expect(getByTestId('review-attention-card-post_b')).toBeTruthy()
      // post_c has only a caption pin -> hidden for designers
      expect(queryByTestId('review-attention-card-post_c')).toBeNull()
    })

    it('designer view shows the image pin comment plus other comments on the post', async () => {
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

    it('designer cannot edit captions or mark addressed', async () => {
      vi.mocked(requireClientViewer).mockResolvedValue(designerCtx)
      mockLaneThreads()

      const { queryAllByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      })

      // No caption editor affordance.
      expect(queryAllByTestId('edit-caption-button').length).toBe(0)
      // No per-post Mark addressed / un-address buttons.
      expect(queryAllByTestId('mark-post-addressed-button').length).toBe(0)
      expect(queryAllByTestId('unmark-post-addressed-button').length).toBe(0)
    })

    it('AM view still shows all attention posts (image + caption-only)', async () => {
      // mockCtx is account_manager by default.
      mockLaneThreads()

      const { getByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      })

      expect(getByTestId('review-attention-card-post_b')).toBeTruthy()
      expect(getByTestId('review-attention-card-post_c')).toBeTruthy()
    })
  })

  describe('AM inline caption edit (Task 7)', () => {
    it('does not render the caption editor when canEditClients is false', async () => {
      vi.mocked(canEditClients).mockReturnValue(false)
      const { queryAllByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      })
      expect(queryAllByTestId('edit-caption-button').length).toBe(0)
    })

    it('edits and saves a caption, calling updatePostAction with the new caption for the right post', async () => {
      vi.mocked(canEditClients).mockReturnValue(true)
      // Only post_b is an attention post (changes_requested); post_c too.
      const { getByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      })

      // Open the editor for post_b.
      const card = getByTestId('review-attention-card-post_b')
      const editButton = card.querySelector(
        '[data-testid="edit-caption-button"]',
      ) as HTMLElement
      expect(editButton).toBeTruthy()
      fireEvent.click(editButton)

      // Change the textarea.
      const textarea = card.querySelector(
        '[data-testid="caption-editor-textarea"]',
      ) as HTMLTextAreaElement
      expect(textarea).toBeTruthy()
      fireEvent.change(textarea, { target: { value: 'B reworked caption' } })

      // Save.
      const saveButton = card.querySelector(
        '[data-testid="caption-editor-save"]',
      ) as HTMLElement
      fireEvent.click(saveButton)

      expect(vi.mocked(updatePostAction)).toHaveBeenCalledWith('post_b', {
        caption: 'B reworked caption',
      })
    })
  })

  describe('image upload / replace affordance (Task 8)', () => {
    it('renders the upload affordance when canUploadPostMedia is true', async () => {
      vi.mocked(canUploadPostMedia).mockReturnValue(true)
      const { getByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      })
      const card = getByTestId('review-attention-card-post_b')
      // post_b has no media, so the dropzone affordance should render.
      expect(
        card.querySelector('[data-testid="media-upload-dropzone"]'),
      ).toBeTruthy()
    })

    it('does NOT render the upload affordance when canUploadPostMedia is false', async () => {
      vi.mocked(canUploadPostMedia).mockReturnValue(false)
      const { getByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      })
      const card = getByTestId('review-attention-card-post_b')
      expect(
        card.querySelector('[data-testid="media-upload-dropzone"]'),
      ).toBeNull()
      expect(
        card.querySelector('[data-testid="media-upload-current"]'),
      ).toBeNull()
    })
  })

  describe('activity chat for internal revision pings (Task 12)', () => {
    it('renders the activity chat on the review session page', async () => {
      const { getByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      })
      expect(getByTestId('review-activity-thread')).toBeTruthy()
    })
  })

  describe('composer gate on the internal thread (Task 12b)', () => {
    function threadStub(container: HTMLElement): HTMLElement {
      return container.querySelector(
        '[data-component="activity-thread-stub"]',
      ) as HTMLElement
    }

    it('shows the composer for comment-capable users (canComment true)', async () => {
      vi.mocked(canComment).mockReturnValue(true)
      const { container } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      })
      expect(threadStub(container).getAttribute('data-hide-composer')).toBe(
        'false',
      )
    })

    it('hides the composer for users without client.comment (canComment false)', async () => {
      vi.mocked(canComment).mockReturnValue(false)
      const { container } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
        sessionId: 'session_1',
      })
      expect(threadStub(container).getAttribute('data-hide-composer')).toBe(
        'true',
      )
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
      expect(threadStub(container).getAttribute('data-hide-composer')).toBe(
        'false',
      )
    })
  })
})
