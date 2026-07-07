import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

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
  canUploadPostMedia: vi.fn(),
  canComment: vi.fn(),
}))

vi.mock('@/server/repositories/clients', () => ({
  findClientForUser: vi.fn(),
}))

vi.mock('@/server/repositories/batches', () => ({
  findBatch: vi.fn(),
}))

vi.mock('@/server/repositories/designerGateAcks', () => ({
  hasDesignerGateAck: vi.fn(),
}))

vi.mock('@/components/relay/designer-onboarding-gate', () => ({
  DesignerOnboardingGate: () => <div data-testid="designer-gate" />,
}))

vi.mock('@/components/onboarding/tour-autostart', () => ({
  TourAutostart: () => <div data-testid="tour-autostart" />,
}))

vi.mock('@/server/repositories/reviewSessions', () => ({
  listSessionsForBatch: vi.fn(),
}))

vi.mock('@/server/repositories/activityEvents', () => ({
  listActivityForClient: vi.fn().mockResolvedValue([]),
  visibilityForViewer: vi.fn().mockReturnValue(['public', 'internal']),
}))

vi.mock('@/server/repositories/memberships', () => ({
  listMembershipsForOrg: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/server/repositories/contentRuns', () => ({
  findRunForBatch: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/server/services/relay', () => ({
  passBaton: vi.fn(),
}))

vi.mock('@/server/lib/relay-state-machine', () => ({
  legalNextSteps: vi.fn().mockReturnValue([]),
  legalSendBackTargets: vi.fn().mockReturnValue([]),
}))

vi.mock('@/server/auth/permissions', () => ({
  can: vi.fn().mockReturnValue(false),
}))

vi.mock('@/server/services/postVersions', () => ({
  listVersionsForPost: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/mentions', () => ({
  buildMentionRoster: vi.fn().mockReturnValue([]),
}))

vi.mock('@/lib/relay-step-labels', () => ({
  relayStepLabel: vi.fn().mockReturnValue('Copy'),
}))

vi.mock('@/lib/batch-target-month', () => ({
  resolveBatchTargetMonth: vi.fn().mockReturnValue('2026-05'),
}))

vi.mock('@/lib/canva', () => ({
  resolveCanvaUrl: vi.fn().mockReturnValue('#'),
}))

vi.mock('@/lib/relay-holder-override', () => ({
  canOverrideHolder: vi.fn().mockReturnValue(false),
}))

vi.mock('@/lib/relay-celebration', () => ({
  isRelayCelebrationStep: vi.fn().mockReturnValue(false),
}))

vi.mock('@/lib/celebration-avatars', () => ({
  buildClerkPhotoMap: vi.fn().mockReturnValue(new Map()),
  resolveCelebrationParticipants: vi.fn().mockReturnValue([]),
}))

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn().mockResolvedValue({
    users: {
      getUserList: vi.fn().mockResolvedValue({ data: [] }),
    },
  }),
}))

vi.mock('@/db/client', () => ({
  db: {
    post: { findMany: vi.fn() },
    magicLink: { findMany: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    client: { findUnique: vi.fn() },
  },
}))

// Stub heavy client components so server-side render under jsdom works cleanly.
vi.mock('@/components/clients/client-team-header', () => ({
  ClientTeamHeader: () => <div data-testid="client-team-header-stub" />,
}))

vi.mock('@/components/hero-band', () => ({
  HeroBand: (props: { title: string }) => (
    <div data-testid="hero-band-stub" data-title={props.title} />
  ),
}))

vi.mock('@/components/relay/relay-track', () => ({
  RelayTrack: () => <div data-testid="relay-track-stub" />,
}))

vi.mock('@/components/relay/checklist-panel', () => ({
  ChecklistPanel: () => <div data-testid="checklist-panel-stub" />,
}))

vi.mock('@/components/relay/client-decision-panel', () => ({
  ClientDecisionPanel: () => <div data-testid="client-decision-panel-stub" />,
}))

vi.mock('@/components/relay/generate-content-dialog', () => ({
  GenerateContentDialog: () => <div data-testid="generate-content-dialog-stub" />,
}))

vi.mock('@/components/relay/archive-batch-button', () => ({
  ArchiveBatchButton: () => <div data-testid="archive-batch-button-stub" />,
}))

vi.mock('@/components/relay/restore-batch-button', () => ({
  RestoreBatchBanner: () => <div data-testid="restore-batch-banner-stub" />,
}))

vi.mock('@/components/relay/relay-completed-banner', () => ({
  RelayCompletedBanner: ({ completedAt }: { completedAt: Date | null }) => (
    <div data-testid="relay-completed-banner-stub">
      This relay is completed
      {completedAt && <time dateTime={completedAt.toISOString()} />}
    </div>
  ),
}))

vi.mock('@/components/relay/batch-completion-lap', () => ({
  BatchCompletionLap: () => <div data-testid="batch-completion-lap-stub" />,
}))

vi.mock('@/components/activity/activity-thread', () => ({
  ActivityThread: () => <div data-testid="activity-thread-stub" />,
}))

vi.mock('@/components/activity/mobile-thread-fab', () => ({
  MobileThreadFab: () => <div data-testid="mobile-thread-fab-stub" />,
}))

vi.mock('@/components/notifications/event-anchor', () => ({
  EventAnchor: () => <div data-testid="event-anchor-stub" />,
}))

vi.mock('@/components/posts/post-card', () => ({
  PostCard: (props: { post: { id: string } }) => (
    <div data-testid={`post-card-${props.post.id}`} />
  ),
}))

vi.mock('@/components/posts/post-version-history', () => ({
  PostVersionHistory: () => <div data-testid="post-version-history-stub" />,
}))

vi.mock('@/components/posts/bulk-media-upload-panel', () => ({
  BulkMediaUploadPanel: (props: { posts: ReadonlyArray<{ id: string }> }) => (
    <div
      data-testid="bulk-media-upload-panel-stub"
      data-post-count={props.posts.length}
    />
  ),
}))

vi.mock('@/components/posts/post-list-collapse', () => ({
  PostListCollapseProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PostListExpandAllToggle: () => <div data-testid="expand-all-toggle-stub" />,
}))

vi.mock('@/components/runs/cost-breakdown', () => ({
  CostBreakdown: () => <div data-testid="cost-breakdown-stub" />,
}))

vi.mock('@/components/runs/failed-run-banner', () => ({
  FailedRunBanner: () => <div data-testid="failed-run-banner-stub" />,
}))

vi.mock('@/components/runs/export-button', () => ({
  ExportButton: () => <div data-testid="export-button-stub" />,
}))

vi.mock('@/components/batch/send-link-button', () => ({
  SendLinkButton: () => <div data-testid="send-link-button-stub" />,
}))

vi.mock('@/components/batch/open-client-content-button', () => ({
  OpenClientContentButton: () => (
    <div data-testid="open-client-content-button-stub" />
  ),
}))

vi.mock('@/components/batch/magic-link-row', () => ({
  MagicLinkRow: (props: { id: string }) => (
    <div data-testid={`magic-link-row-${props.id}`} />
  ),
}))

// ---------- imports ----------

import BatchDetailPage from '@/app/(app)/clients/[id]/batches/[batchId]/page'
import { NECTR_CRM_URL } from '@/lib/nectr'
import {
  requireClientViewer,
  canEditClients,
  canUploadPostMedia,
  canComment,
} from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import { findBatch } from '@/server/repositories/batches'
import { hasDesignerGateAck } from '@/server/repositories/designerGateAcks'
import { listSessionsForBatch } from '@/server/repositories/reviewSessions'
import { findRunForBatch } from '@/server/repositories/contentRuns'
import { can } from '@/server/auth/permissions'
import { db } from '@/db/client'

// ---------- fixtures ----------

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
  assignedAmId: null,
  assignedDesignerId: null,
  canvaUrl: null,
  assetsFolderUrl: null,
}

const mockBatch = {
  id: 'batch_1',
  clientId: 'client_1',
  label: 'May 2026',
  currentStep: 'copy',
  currentSubState: null,
  currentRole: 'account_manager',
  currentHolder: 'user_db_1',
  scheduledAt: null,
  createdAt: new Date('2026-05-01T00:00:00Z'),
  deletedAt: null,
  deletedBy: null,
  clientReviewEnabled: true,
  autoAdvanceOnTimeout: false,
  holder: { id: 'user_db_1', name: 'Julio Aleman' },
  client: {
    id: 'client_1',
    name: 'Demo Client',
    organizationId: 'org_db_1',
    clientReviewEmail: null,
  },
  checklists: [],
}

const mockSubmittedSession = {
  id: 'session_submitted_1',
  kind: 'client',
  magicLinkId: 'ml_1',
  reviewerId: null,
  reviewer: { id: 'rev_1', name: 'Alice Reviewer', email: 'alice@example.com' },
  status: 'submitted',
  round: 1,
  startedAt: new Date('2026-05-10T10:00:00Z'),
  submittedAt: new Date('2026-05-10T12:00:00Z'),
  items: [],
}

async function renderPage(params: { id: string; batchId: string }) {
  const ui = await BatchDetailPage({
    params: Promise.resolve(params),
    searchParams: Promise.resolve({}),
  })
  return render(ui)
}

// ---------- setup ----------

describe('BatchDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireClientViewer).mockResolvedValue(mockCtx)
    vi.mocked(canEditClients).mockReturnValue(true)
    vi.mocked(canUploadPostMedia).mockReturnValue(false)
    vi.mocked(canComment).mockReturnValue(false)
    vi.mocked(findClientForUser).mockResolvedValue(mockClient as never)
    vi.mocked(findBatch).mockResolvedValue(mockBatch as never)
    // Default gate to acknowledged so every pre-existing test (including the
    // designer-role NextActionBoard cases at designer steps) renders the
    // workspace. Gate-specific tests opt in by overriding to false.
    vi.mocked(hasDesignerGateAck).mockResolvedValue(true)
    vi.mocked(listSessionsForBatch).mockResolvedValue([])
    vi.mocked(db.post.findMany).mockResolvedValue([] as never)
    vi.mocked(db.magicLink.findMany).mockResolvedValue([] as never)
    vi.mocked(db.user.findUnique).mockResolvedValue(null as never)
    vi.mocked(db.user.findMany).mockResolvedValue([] as never)
    vi.mocked(db.client.findUnique).mockResolvedValue(null as never)
  })

  // ---- Generate Content is not offered inside an active relay ----

  describe('GenerateContentDialog is never rendered on the batch page', () => {
    it('does not render the dialog even for a generating holder on a live relay', async () => {
      // In-relay Generate was removed: it only did a full destructive
      // regenerate. Content is refined per-post / via revisions; a restart is
      // Archive + generate from the client page.
      const { queryByTestId } = await renderPage({ id: 'client_1', batchId: 'batch_1' })
      expect(queryByTestId('generate-content-dialog-stub')).toBeNull()
    })
  })

  // ---- Cost breakdown role gating ----

  describe('Cost breakdown visibility by role', () => {
    const runWithBreakdown = {
      id: 'run_1',
      status: 'complete',
      tokenUsage: {
        breakdown: { total: 1.23, credits: 5 },
        pipelineDurationSeconds: 12,
      },
    }

    // The page gates the cost breakdown on can(ctx, 'cost.viewAll'). `can` is
    // module-mocked to false in this file, so drive it from the ctx the way the
    // real matrix does (admin or platform owner only). The real per-role matrix
    // is covered in tests/server/auth/permissions.test.ts.
    beforeEach(() => {
      vi.mocked(findRunForBatch).mockResolvedValue(runWithBreakdown as never)
      vi.mocked(can).mockImplementation(
        (ctx: { role?: string; platformOwner?: boolean }, key: string) =>
          key === 'cost.viewAll'
            ? ctx.role === 'admin' || ctx.platformOwner === true
            : false,
      )
    })

    it('renders for admin', async () => {
      vi.mocked(requireClientViewer).mockResolvedValue({ ...mockCtx, role: 'admin' })

      const { queryByTestId } = await renderPage({ id: 'client_1', batchId: 'batch_1' })
      expect(queryByTestId('cost-breakdown-stub')).not.toBeNull()
    })

    it('renders for platform owner regardless of role', async () => {
      vi.mocked(requireClientViewer).mockResolvedValue({
        ...mockCtx,
        role: 'account_manager',
        platformOwner: true,
      })

      const { queryByTestId } = await renderPage({ id: 'client_1', batchId: 'batch_1' })
      expect(queryByTestId('cost-breakdown-stub')).not.toBeNull()
    })

    it('is hidden for account managers', async () => {
      vi.mocked(requireClientViewer).mockResolvedValue({
        ...mockCtx,
        role: 'account_manager',
      })

      const { queryByTestId } = await renderPage({ id: 'client_1', batchId: 'batch_1' })
      expect(queryByTestId('cost-breakdown-stub')).toBeNull()
    })

    it('is hidden for designers', async () => {
      vi.mocked(requireClientViewer).mockResolvedValue({ ...mockCtx, role: 'designer' })

      const { queryByTestId } = await renderPage({ id: 'client_1', batchId: 'batch_1' })
      expect(queryByTestId('cost-breakdown-stub')).toBeNull()
    })
  })

  // ---- Next-action board (cost above, board below, all roles) ----

  describe('NextActionBoard', () => {
    const runWithBreakdown = {
      id: 'run_1',
      status: 'complete',
      tokenUsage: {
        breakdown: { total: 1.23, credits: 5 },
        pipelineDurationSeconds: 12,
      },
    }

    beforeEach(() => {
      vi.mocked(can).mockImplementation(
        (ctx: { role?: string; platformOwner?: boolean }, key: string) =>
          key === 'cost.viewAll'
            ? ctx.role === 'admin' || ctx.platformOwner === true
            : false,
      )
    })

    it('renders for a non-admin viewer with no cost access', async () => {
      vi.mocked(requireClientViewer).mockResolvedValue({
        ...mockCtx,
        role: 'designer',
      })
      vi.mocked(findBatch).mockResolvedValue({
        ...mockBatch,
        currentStep: 'in_design',
        currentSubState: null,
        currentHolder: 'someone_else',
      } as never)

      const { queryByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
      })
      expect(queryByTestId('next-action-board')).not.toBeNull()
      expect(queryByTestId('cost-breakdown-stub')).toBeNull()
    })

    it('renders the cost breakdown ABOVE the board for an admin', async () => {
      vi.mocked(requireClientViewer).mockResolvedValue({
        ...mockCtx,
        role: 'admin',
      })
      vi.mocked(findRunForBatch).mockResolvedValue(runWithBreakdown as never)

      const { container, getByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
      })
      const cost = getByTestId('cost-breakdown-stub')
      const board = getByTestId('next-action-board')
      // DOM order: cost precedes the board.
      const order = cost.compareDocumentPosition(board)
      expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(container).toBeTruthy()
    })

    it('reflects the current step / sub-state in the action (designer revises at awaiting_design_revisions)', async () => {
      vi.mocked(requireClientViewer).mockResolvedValue({
        ...mockCtx,
        role: 'designer',
      })
      vi.mocked(findBatch).mockResolvedValue({
        ...mockBatch,
        currentStep: 'am_review_design',
        currentSubState: 'awaiting_design_revisions',
        currentHolder: 'someone_else',
      } as never)

      const { getByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
      })
      const board = getByTestId('next-action-board')
      expect(board.dataset.tone).toBe('action')
      expect(board.textContent).toMatch(/revise the designs/i)
    })

    it('shows a waiting state for the non-actor', async () => {
      vi.mocked(requireClientViewer).mockResolvedValue({
        ...mockCtx,
        role: 'account_manager',
      })
      vi.mocked(findBatch).mockResolvedValue({
        ...mockBatch,
        currentStep: 'in_design',
        currentSubState: null,
        currentHolder: 'someone_else',
      } as never)
      vi.mocked(can).mockReturnValue(false)

      const { getByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
      })
      const board = getByTestId('next-action-board')
      expect(board.dataset.tone).toBe('waiting')
    })

    it('does not surface an internal Design Review submission as client feedback during client_review', async () => {
      vi.mocked(requireClientViewer).mockResolvedValue({
        ...mockCtx,
        role: 'account_manager',
      })
      vi.mocked(findBatch).mockResolvedValue({
        ...mockBatch,
        currentStep: 'client_review',
        currentSubState: null,
        currentHolder: 'someone_else',
      } as never)
      // Only an INTERNAL (Design Review) session is submitted; the client has
      // not submitted yet. It must NOT count as client feedback / a deep link.
      vi.mocked(listSessionsForBatch).mockResolvedValue([
        {
          ...mockSubmittedSession,
          id: 'internal_submitted_1',
          kind: 'internal',
          magicLinkId: null,
        },
      ] as never)

      const { getByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
      })
      const board = getByTestId('next-action-board')
      expect(board.textContent).toMatch(/awaiting client review/i)
      expect(board.textContent).not.toMatch(/view client feedback/i)
    })
  })

  // ---- Bulk media upload panel (item 35) ----

  describe('Bulk media upload panel', () => {
    const post = {
      id: 'post_a',
      postDate: new Date('2026-05-10T00:00:00Z'),
      caption: 'Hello',
      hashtags: [],
      graphicHook: null,
      designerNotes: null,
      contentRunId: 'run_1',
      deletedAt: null,
      mediaUrls: [],
    }

    it('renders at the top of the posts section when the actor can upload media', async () => {
      vi.mocked(canUploadPostMedia).mockReturnValue(true)
      vi.mocked(db.post.findMany).mockResolvedValue([post] as never)

      const { getByTestId } = await renderPage({ id: 'client_1', batchId: 'batch_1' })
      const panel = getByTestId('bulk-media-upload-panel-stub')
      expect(panel.dataset.postCount).toBe('1')
    })

    it('is hidden when the actor cannot upload media', async () => {
      vi.mocked(canUploadPostMedia).mockReturnValue(false)
      vi.mocked(db.post.findMany).mockResolvedValue([post] as never)

      const { queryByTestId } = await renderPage({ id: 'client_1', batchId: 'batch_1' })
      expect(queryByTestId('bulk-media-upload-panel-stub')).toBeNull()
    })

    it('is hidden when there are no posts', async () => {
      vi.mocked(canUploadPostMedia).mockReturnValue(true)
      vi.mocked(db.post.findMany).mockResolvedValue([] as never)

      const { queryByTestId } = await renderPage({ id: 'client_1', batchId: 'batch_1' })
      expect(queryByTestId('bulk-media-upload-panel-stub')).toBeNull()
    })

    it('is hidden when the batch is archived', async () => {
      vi.mocked(canUploadPostMedia).mockReturnValue(true)
      vi.mocked(db.post.findMany).mockResolvedValue([post] as never)
      vi.mocked(findBatch).mockResolvedValue({
        ...mockBatch,
        deletedAt: new Date('2026-05-20T00:00:00Z'),
      } as never)

      const { queryByTestId } = await renderPage({ id: 'client_1', batchId: 'batch_1' })
      expect(queryByTestId('bulk-media-upload-panel-stub')).toBeNull()
    })
  })

  // ---- Tour coachmark anchors (item 39 Phase 2) ----

  describe('Tour coachmark anchors', () => {
    it('renders the data-tour-anchor targets the batch-detail coachmark points at', async () => {
      // relay-posts now anchors the FIRST post card, so a post must exist.
      vi.mocked(db.post.findMany).mockResolvedValue([
        {
          id: 'post_a',
          postDate: new Date('2026-05-10T00:00:00Z'),
          caption: 'Hello',
          hashtags: [],
          graphicHook: null,
          designerNotes: null,
          contentRunId: 'run_1',
          deletedAt: null,
          mediaUrls: [],
        },
      ] as never)

      const { container } = await renderPage({ id: 'client_1', batchId: 'batch_1' })
      expect(container.querySelector('[data-tour-anchor="relay-track"]')).not.toBeNull()
      expect(container.querySelector('[data-tour-anchor="relay-posts"]')).not.toBeNull()
      expect(container.querySelector('[data-tour-anchor="relay-actions"]')).not.toBeNull()
    })
  })

  // ---- Copy step single checklist (P1 #8) ----

  describe('Copy step single checklist', () => {
    // The copy step now renders the same single ChecklistPanel as every other
    // step (P1 #8). The retired CopySubStatePanel is a compile-time guarantee:
    // a lingering import of the deleted module would fail the build, so this
    // test just guards that the checklist itself still renders at copy (a
    // future refactor of the sidebar ternary could drop it).
    it('renders the checklist panel at the copy step', async () => {
      vi.mocked(findBatch).mockResolvedValue({
        ...mockBatch,
        currentStep: 'copy',
        currentSubState: 'generating',
      } as never)

      const { queryByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
      })

      expect(queryByTestId('checklist-panel-stub')).not.toBeNull()
    })
  })

  // ---- Go to NectrCRM chip (item 37) ----

  describe('Go to NectrCRM chip', () => {
    it('renders at the scheduling step, linking out to NectrCRM', async () => {
      vi.mocked(findBatch).mockResolvedValue({
        ...mockBatch,
        currentStep: 'scheduling',
      } as never)

      // The action-row chip is identified by its testid; the next-action board
      // also surfaces a "Go to NectrCRM" link at the scheduling step, so scope
      // this assertion to the chip specifically.
      const { getByTestId } = await renderPage({ id: 'client_1', batchId: 'batch_1' })
      const link = getByTestId('go-to-nectrcrm-link')
      expect(link).toHaveAttribute('href', NECTR_CRM_URL)
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('is hidden outside the scheduling step', async () => {
      vi.mocked(findBatch).mockResolvedValue({
        ...mockBatch,
        currentStep: 'copy',
      } as never)

      const { queryByRole } = await renderPage({ id: 'client_1', batchId: 'batch_1' })
      expect(queryByRole('link', { name: /go to nectrcrm/i })).toBeNull()
    })
  })

  // ---- ReviewSessionListRow CTA label ----

  describe('ReviewSessionListRow link label', () => {
    it('row link text reads "View client feedback" and aria-label matches', async () => {
      vi.mocked(listSessionsForBatch).mockResolvedValue([
        mockSubmittedSession,
      ] as never)

      const { getByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
      })

      const link = getByTestId(`review-session-open-${mockSubmittedSession.id}`)
      expect(link.getAttribute('aria-label')).toBe('View client feedback')
      expect(link.textContent).toContain('View client feedback')
    })

    it('does not contain the old "Open detail" text', async () => {
      vi.mocked(listSessionsForBatch).mockResolvedValue([
        mockSubmittedSession,
      ] as never)

      const { getByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
      })

      const link = getByTestId(`review-session-open-${mockSubmittedSession.id}`)
      expect(link.textContent).not.toContain('Open detail')
    })
  })

  // ---- Client review pill collapse + feedback badge ----

  describe('client review pill collapse and feedback badge', () => {
    it('collapses multiple sessions to one row, shows "Client review" title, and renders the feedback badge', async () => {
      const supersededSession = {
        id: 'session_superseded_1',
        kind: 'client',
        magicLinkId: 'ml_1',
        reviewerId: null,
        reviewer: { id: 'rev_1', name: 'Alice Reviewer', email: 'alice@example.com' },
        status: 'superseded',
        round: 1,
        startedAt: new Date('2026-05-08T10:00:00Z'),
        submittedAt: new Date('2026-05-08T12:00:00Z'),
        items: [],
      }
      const duplicateInProgressSession = {
        id: 'session_duplicate_in_progress_1',
        kind: 'client',
        magicLinkId: 'ml_1',
        reviewerId: null,
        reviewer: { id: 'rev_1', name: 'Alice Reviewer', email: 'alice@example.com' },
        status: 'in_progress',
        round: 1,
        startedAt: new Date('2026-05-09T10:00:00Z'),
        submittedAt: null,
        items: [],
      }
      const submittedWithFeedback = {
        id: 'session_submitted_with_feedback_1',
        kind: 'client',
        magicLinkId: 'ml_1',
        reviewerId: null,
        reviewer: { id: 'rev_1', name: 'Alice Reviewer', email: 'alice@example.com' },
        status: 'submitted',
        round: 1,
        startedAt: new Date('2026-05-10T10:00:00Z'),
        submittedAt: new Date('2026-05-10T12:00:00Z'),
        items: [
          { decision: 'changes_requested', comment: null },
          { decision: 'approved', comment: null },
          { decision: 'approved', comment: null },
        ],
      }

      vi.mocked(listSessionsForBatch).mockResolvedValue([
        supersededSession,
        duplicateInProgressSession,
        submittedWithFeedback,
      ] as never)

      const { getAllByTestId, getByText, getByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
      })

      const rows = getAllByTestId(/^review-session-list-row-/)
      expect(rows).toHaveLength(1)
      expect(getByText('Client review')).toBeInTheDocument()
      expect(getByTestId('review-feedback-badge')).toHaveTextContent('1 Feedback')
    })
  })

  // ---- Review link pill (single active magic link) ----

  describe('Review link pill (single active link)', () => {
    it('queries for only the active link: not revoked, not expired, take 1', async () => {
      vi.mocked(db.magicLink.findMany).mockResolvedValue([] as never)

      await renderPage({ id: 'client_1', batchId: 'batch_1' })

      const args = vi.mocked(db.magicLink.findMany).mock.calls[0]?.[0] as {
        where?: { revokedAt?: unknown; expiresAt?: { gt?: unknown } }
        take?: number
      }
      expect(args?.where?.revokedAt).toBeNull()
      expect(args?.where?.expiresAt?.gt).toBeInstanceOf(Date)
      expect(args?.take).toBe(1)
    })

    it('renders one "Review link" pill for the active link', async () => {
      vi.mocked(db.magicLink.findMany).mockResolvedValue([
        {
          id: 'ml_active',
          defaultReviewerName: 'Jane',
          defaultReviewerEmail: 'jane@co.com',
          expiresAt: new Date('2030-01-01T00:00:00Z'),
          lastVisitedAt: null,
        },
      ] as never)

      const { getByText, getAllByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
      })

      expect(getByText('Review link')).toBeInTheDocument()
      expect(getAllByTestId(/^magic-link-row-/)).toHaveLength(1)
    })
  })

  describe('toolbar Send review link button gating', () => {
    it('shows the Send review link button on Pre-Client QA', async () => {
      vi.mocked(findBatch).mockResolvedValue({
        ...mockBatch,
        currentStep: 'am_qa_pre_client',
      } as never)
      const { queryByTestId } = await renderPage({ id: 'client_1', batchId: 'batch_1' })
      expect(queryByTestId('send-link-button-stub')).toBeInTheDocument()
    })

    it('hides the Send review link button on Design Review', async () => {
      vi.mocked(findBatch).mockResolvedValue({
        ...mockBatch,
        currentStep: 'am_review_design',
      } as never)
      const { queryByTestId } = await renderPage({ id: 'client_1', batchId: 'batch_1' })
      expect(queryByTestId('send-link-button-stub')).not.toBeInTheDocument()
    })
  })

  // ---- Completed relay lock ----

  describe('completed lock', () => {
    const completedBatch = {
      ...mockBatch,
      currentStep: 'completed',
      deletedAt: null,
      completedAt: new Date('2026-07-01'),
    }

    beforeEach(() => {
      vi.mocked(findBatch).mockResolvedValue(completedBatch as never)
    })

    it('shows the completed banner and hides GenerateContentDialog + ChecklistPanel while keeping ActivityThread', async () => {
      const { queryByTestId, getByText } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
      })

      // Banner must appear with the "completed" text
      expect(getByText('This relay is completed')).toBeInTheDocument()

      // Edit surfaces must be hidden
      expect(queryByTestId('generate-content-dialog-stub')).toBeNull()
      expect(queryByTestId('checklist-panel-stub')).toBeNull()

      // Chat must remain
      expect(queryByTestId('activity-thread-stub')).not.toBeNull()

      // Archive is the only recourse — button must still be present
      expect(queryByTestId('archive-batch-button-stub')).not.toBeNull()
    })
  })

  // ---- Designer onboarding gate ----

  describe('Designer onboarding gate', () => {
    it('renders the gate instead of the workspace for a designer at in_design who has not acknowledged', async () => {
      vi.mocked(requireClientViewer).mockResolvedValue({ ...mockCtx, role: 'designer' })
      vi.mocked(findBatch).mockResolvedValue({
        ...mockBatch,
        currentStep: 'in_design',
      } as never)
      vi.mocked(hasDesignerGateAck).mockResolvedValue(false)

      const { getByTestId, queryByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
      })
      expect(getByTestId('designer-gate')).not.toBeNull()
      // Workspace short-circuited: the hero band / relay track never render.
      expect(queryByTestId('relay-track-stub')).toBeNull()
    })

    it('renders the gate for a designer at implementing_revisions who has not acknowledged', async () => {
      vi.mocked(requireClientViewer).mockResolvedValue({ ...mockCtx, role: 'designer' })
      vi.mocked(findBatch).mockResolvedValue({
        ...mockBatch,
        currentStep: 'implementing_revisions',
      } as never)
      vi.mocked(hasDesignerGateAck).mockResolvedValue(false)

      const { getByTestId } = await renderPage({ id: 'client_1', batchId: 'batch_1' })
      expect(getByTestId('designer-gate')).not.toBeNull()
    })

    it('renders the workspace (no gate) for a designer at in_design who already acknowledged', async () => {
      vi.mocked(requireClientViewer).mockResolvedValue({ ...mockCtx, role: 'designer' })
      vi.mocked(findBatch).mockResolvedValue({
        ...mockBatch,
        currentStep: 'in_design',
      } as never)
      vi.mocked(hasDesignerGateAck).mockResolvedValue(true)

      const { queryByTestId } = await renderPage({ id: 'client_1', batchId: 'batch_1' })
      expect(queryByTestId('designer-gate')).toBeNull()
      expect(queryByTestId('relay-track-stub')).not.toBeNull()
    })

    it('does not gate a non-designer (account manager) at in_design even when unacknowledged', async () => {
      vi.mocked(requireClientViewer).mockResolvedValue({
        ...mockCtx,
        role: 'account_manager',
      })
      vi.mocked(findBatch).mockResolvedValue({
        ...mockBatch,
        currentStep: 'in_design',
      } as never)
      vi.mocked(hasDesignerGateAck).mockResolvedValue(false)

      const { queryByTestId } = await renderPage({ id: 'client_1', batchId: 'batch_1' })
      expect(queryByTestId('designer-gate')).toBeNull()
      expect(queryByTestId('relay-track-stub')).not.toBeNull()
    })

    it('does not gate a designer on a non-designer step (copy) even when unacknowledged', async () => {
      vi.mocked(requireClientViewer).mockResolvedValue({ ...mockCtx, role: 'designer' })
      vi.mocked(findBatch).mockResolvedValue({
        ...mockBatch,
        currentStep: 'copy',
      } as never)
      vi.mocked(hasDesignerGateAck).mockResolvedValue(false)

      const { queryByTestId } = await renderPage({ id: 'client_1', batchId: 'batch_1' })
      expect(queryByTestId('designer-gate')).toBeNull()
      expect(queryByTestId('relay-track-stub')).not.toBeNull()
    })
  })

  // ---- Designer tour autostart (batch workspace) ----

  describe('Designer tour autostart', () => {
    it('renders the autostart in the workspace for a designer at a designer step who has acknowledged the gate', async () => {
      vi.mocked(requireClientViewer).mockResolvedValue({ ...mockCtx, role: 'designer' })
      vi.mocked(findBatch).mockResolvedValue({
        ...mockBatch,
        currentStep: 'in_design',
      } as never)
      // Gate acknowledged -> workspace renders (not the gate short-circuit).
      vi.mocked(hasDesignerGateAck).mockResolvedValue(true)

      const { getByTestId, queryByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
      })
      expect(getByTestId('tour-autostart')).not.toBeNull()
      // Confirm the workspace (not the gate) rendered.
      expect(queryByTestId('relay-track-stub')).not.toBeNull()
      expect(queryByTestId('designer-gate')).toBeNull()
    })

    it('does not render the autostart for a non-designer (account manager) in the workspace', async () => {
      vi.mocked(requireClientViewer).mockResolvedValue({
        ...mockCtx,
        role: 'account_manager',
      })
      vi.mocked(findBatch).mockResolvedValue({
        ...mockBatch,
        currentStep: 'in_design',
      } as never)
      vi.mocked(hasDesignerGateAck).mockResolvedValue(true)

      const { queryByTestId } = await renderPage({ id: 'client_1', batchId: 'batch_1' })
      expect(queryByTestId('tour-autostart')).toBeNull()
      expect(queryByTestId('relay-track-stub')).not.toBeNull()
    })

    it('does not render the autostart when the gate short-circuits (designer, unacknowledged)', async () => {
      vi.mocked(requireClientViewer).mockResolvedValue({ ...mockCtx, role: 'designer' })
      vi.mocked(findBatch).mockResolvedValue({
        ...mockBatch,
        currentStep: 'in_design',
      } as never)
      // Unacknowledged -> gate short-circuits before the workspace return, so
      // the autostart (which lives in the workspace tree) never mounts.
      vi.mocked(hasDesignerGateAck).mockResolvedValue(false)

      const { queryByTestId, getByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
      })
      expect(getByTestId('designer-gate')).not.toBeNull()
      expect(queryByTestId('tour-autostart')).toBeNull()
    })
  })
})
