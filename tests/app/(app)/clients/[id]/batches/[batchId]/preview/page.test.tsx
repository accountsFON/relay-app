import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock('@/server/auth/access', () => ({
  redirectAccessDenied: vi.fn(() => {
    throw new Error('NEXT_REDIRECT:/dashboard?denied=1')
  }),
}))

vi.mock('@/server/middleware/permissions', () => ({
  requireClientViewer: vi.fn(),
  canEditClients: vi.fn(),
  canComment: vi.fn(),
  canUploadPostMedia: vi.fn(),
}))

vi.mock('@/server/repositories/activityEvents', () => ({
  listActivityForClient: vi.fn(),
  visibilityForViewer: vi.fn(),
}))

vi.mock('@/server/repositories/memberships', () => ({
  listMembershipsForOrg: vi.fn(),
}))

vi.mock('@/lib/mentions', () => ({
  buildMentionRoster: vi.fn(),
}))

vi.mock('@/components/activity/mobile-thread-fab', () => ({
  MobileThreadFab: () => <div data-testid="internal-chat-fab" />,
}))

vi.mock('@/server/repositories/clients', () => ({
  findClientForUser: vi.fn(),
}))

vi.mock('@/server/repositories/batches', () => ({
  findBatch: vi.fn(),
  listChecklistForBatch: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/server/repositories/threads', () => ({
  listThreadsForBatch: vi.fn(),
}))

vi.mock('@/server/services/approval', () => ({
  derivePostApprovalForBatch: vi.fn(),
}))

// Session functions are mocked as spies so tests can assert they are NOT called.
vi.mock('@/server/repositories/reviewSessions', () => ({
  findActiveSession: vi.fn(),
  startSession: vi.fn(),
}))

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

// Stub server actions used in the control slots so the page can render.
vi.mock('@/server/actions/relay', () => ({
  markBatchReviewedAction: vi.fn(),
  requestDesignChangesAction: vi.fn(),
  markDesignRevisionsDoneAction: vi.fn(),
}))

// The read-only viewer feed (client component).
vi.mock(
  '@/app/(app)/clients/[id]/batches/[batchId]/preview/preview-page-shell',
  () => ({
    PreviewPageShell: (props: {
      client: { id: string; name: string }
      posts: ReadonlyArray<{ id: string }>
      canEdit: boolean
    }) => (
      <div
        data-testid="preview-page-shell"
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

// InternalReviewShell stub — surfaces the new props: canEditCaption, allowPostPins.
// No initialItems or sessionStatus (those are removed from the shell).
vi.mock('@/components/review/internal-review-shell', () => ({
  InternalReviewShell: (props: {
    batchId: string
    posts: ReadonlyArray<{ post: { id: string } }>
    canEditCaption?: boolean
    allowPostPins?: boolean
    amControlsSlot?: React.ReactNode
    designerControlsSlot?: React.ReactNode
  }) => (
    <div data-testid="internal-review-shell" data-batch-id={props.batchId}>
      <span data-testid="shell-canEditCaption">{String(props.canEditCaption ?? true)}</span>
      <span data-testid="shell-allowPostPins">{String(props.allowPostPins ?? true)}</span>
      {props.amControlsSlot && (
        <div data-testid="shell-am-controls-slot">{props.amControlsSlot}</div>
      )}
      {props.designerControlsSlot && (
        <div data-testid="shell-designer-controls-slot">{props.designerControlsSlot}</div>
      )}
      {props.posts.map((p) => (
        <div key={p.post.id} data-testid="internal-shell-post" data-post-id={p.post.id} />
      ))}
    </div>
  ),
}))

// Stub client-component buttons so jsdom doesn't choke on 'use client' internals.
vi.mock('@/components/preview/mark-batch-reviewed-button', () => ({
  MarkBatchReviewedButton: () => (
    <button data-testid="mark-batch-reviewed-button">Mark relay reviewed</button>
  ),
}))

vi.mock('@/components/review/request-changes-button', () => ({
  RequestChangesButton: () => (
    <button data-testid="request-changes-button">Request changes</button>
  ),
}))

vi.mock('@/components/review/mark-revisions-done-button', () => ({
  MarkRevisionsDoneButton: () => (
    <button data-testid="mark-revisions-done-button">Mark revisions done</button>
  ),
}))

vi.mock('@/components/preview/post-image-replace', () => ({
  usePostImageReplace: () => ({ dragProps: {}, isDragging: false, overlay: null }),
}))

import BatchPreviewPage from '@/app/(app)/clients/[id]/batches/[batchId]/preview/page'
import {
  requireClientViewer,
  canEditClients,
  canComment,
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
import { listActivityForClient } from '@/server/repositories/activityEvents'
import { listMembershipsForOrg } from '@/server/repositories/memberships'
import { buildMentionRoster } from '@/lib/mentions'
import { RelayStep } from '@prisma/client'

// ---- shared fixtures ----

const mockCtxAM = {
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

const mockCtxDesigner = {
  ...mockCtxAM,
  role: 'designer' as const,
  userDbId: 'designer_db_1',
}

// A client-role user: cannot edit, not the assigned designer (different userDbId).
const mockCtxViewer = {
  ...mockCtxAM,
  role: 'client' as const,
  userDbId: 'viewer_db_1',
}

const mockClient = {
  id: 'client_1',
  name: 'Demo Client',
  organizationId: 'org_db_1',
  assignedDesignerId: 'designer_db_1',
}

const mockBatch = {
  id: 'batch_1',
  clientId: 'client_1',
  label: 'May 2026',
  currentStep: RelayStep.am_review_design,
  currentSubState: null,
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
    // Default: AM editor context
    vi.mocked(requireClientViewer).mockResolvedValue(mockCtxAM)
    vi.mocked(canEditClients).mockReturnValue(true)
    vi.mocked(canComment).mockReturnValue(true)
    vi.mocked(findClientForUser).mockResolvedValue(mockClient as never)
    vi.mocked(findBatch).mockResolvedValue(mockBatch as never)
    vi.mocked(db.post.findMany).mockResolvedValue(mockPosts as never)
    vi.mocked(db.postComment?.count).mockResolvedValue(0 as never)
    vi.mocked(db.user?.findUnique).mockResolvedValue(null as never)
    vi.mocked(db.reviewItem?.findMany).mockResolvedValue([] as never)
    vi.mocked(listThreadsForBatch).mockResolvedValue(new Map())
    vi.mocked(derivePostApprovalForBatch).mockResolvedValue({ ready: 2, pending: 0 })
    vi.mocked(findActiveSession).mockResolvedValue(null)
    vi.mocked(startSession).mockResolvedValue({ id: 'session_1', status: 'in_progress' } as never)
    vi.mocked(listActivityForClient).mockResolvedValue([] as never)
    vi.mocked(listMembershipsForOrg).mockResolvedValue([] as never)
    vi.mocked(buildMentionRoster).mockReturnValue([])
  })

  // ---- session-free contract ----

  it('does not create or read an internal ReviewSession', async () => {
    await renderPage({ id: 'client_1', batchId: 'batch_1' })
    expect(findActiveSession).not.toHaveBeenCalled()
    expect(startSession).not.toHaveBeenCalled()
  })

  // ---- AM branch ----

  it('renders the markup shell for the AM with the Request-changes + Mark-relay-reviewed controls', async () => {
    await renderPage({ id: 'client_1', batchId: 'batch_1' })
    expect(screen.getByTestId('internal-review-shell')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /request changes/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /mark relay reviewed/i })).toBeInTheDocument()
  })

  it('passes canEditCaption=true and allowPostPins=true to the shell for an AM', async () => {
    await renderPage({ id: 'client_1', batchId: 'batch_1' })
    expect(screen.getByTestId('shell-canEditCaption')).toHaveTextContent('true')
    expect(screen.getByTestId('shell-allowPostPins')).toHaveTextContent('true')
  })

  it('renders the AM/designer chat FAB for the AM editor', async () => {
    await renderPage({ id: 'client_1', batchId: 'batch_1' })
    expect(screen.getByTestId('internal-chat-fab')).toBeInTheDocument()
  })

  // ---- designer branch ----

  it('gives the assigned designer the markup shell with canEditCaption=false and allowPostPins=false', async () => {
    vi.mocked(requireClientViewer).mockResolvedValue(mockCtxDesigner)
    vi.mocked(canEditClients).mockReturnValue(false)
    await renderPage({ id: 'client_1', batchId: 'batch_1' })
    expect(screen.getByTestId('internal-review-shell')).toBeInTheDocument()
    expect(screen.getByTestId('shell-canEditCaption')).toHaveTextContent('false')
    expect(screen.getByTestId('shell-allowPostPins')).toHaveTextContent('false')
  })

  it('shows Mark-revisions-done to the designer only when awaiting revisions', async () => {
    vi.mocked(requireClientViewer).mockResolvedValue(mockCtxDesigner)
    vi.mocked(canEditClients).mockReturnValue(false)
    vi.mocked(findBatch).mockResolvedValue({
      ...mockBatch,
      currentStep: RelayStep.am_review_design,
      currentSubState: 'awaiting_design_revisions',
    } as never)
    await renderPage({ id: 'client_1', batchId: 'batch_1' })
    expect(screen.getByRole('button', { name: /mark revisions done/i })).toBeInTheDocument()
  })

  it('does NOT show Mark-revisions-done to the designer when not awaiting revisions', async () => {
    vi.mocked(requireClientViewer).mockResolvedValue(mockCtxDesigner)
    vi.mocked(canEditClients).mockReturnValue(false)
    vi.mocked(findBatch).mockResolvedValue({
      ...mockBatch,
      currentStep: RelayStep.am_review_design,
      currentSubState: null,
    } as never)
    await renderPage({ id: 'client_1', batchId: 'batch_1' })
    expect(screen.queryByRole('button', { name: /mark revisions done/i })).not.toBeInTheDocument()
  })

  it('mounts the FAB for the designer too', async () => {
    vi.mocked(requireClientViewer).mockResolvedValue(mockCtxDesigner)
    vi.mocked(canEditClients).mockReturnValue(false)
    await renderPage({ id: 'client_1', batchId: 'batch_1' })
    expect(screen.getByTestId('internal-chat-fab')).toBeInTheDocument()
  })

  // ---- read-only viewer ----

  it('falls back to the read-only PreviewPageShell for a non-AM non-designer viewer', async () => {
    vi.mocked(requireClientViewer).mockResolvedValue(mockCtxViewer)
    vi.mocked(canEditClients).mockReturnValue(false)
    // viewer_db_1 !== designer_db_1 so not the assigned designer
    await renderPage({ id: 'client_1', batchId: 'batch_1' })
    expect(screen.queryByTestId('internal-review-shell')).not.toBeInTheDocument()
    expect(screen.getByTestId('preview-page-shell')).toBeInTheDocument()
  })

  // ---- access guard ----

  it('redirects to access-denied when the user lacks access to the client', async () => {
    vi.mocked(findClientForUser).mockResolvedValue(null)
    await expect(
      renderPage({ id: 'client_1', batchId: 'batch_1' }),
    ).rejects.toThrow('NEXT_REDIRECT:/dashboard?denied=1')
  })
})
