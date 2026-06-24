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

vi.mock('@/components/relay/copy-substate-panel', () => ({
  CopySubStatePanel: () => <div data-testid="copy-substate-panel-stub" />,
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
import {
  requireClientViewer,
  canEditClients,
  canUploadPostMedia,
  canComment,
} from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import { findBatch } from '@/server/repositories/batches'
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
  magicLinkId: 'ml_1',
  reviewerId: null,
  reviewer: { id: 'rev_1', name: 'Alice Reviewer', email: 'alice@example.com' },
  status: 'submitted',
  round: 1,
  startedAt: new Date('2026-05-10T10:00:00Z'),
  submittedAt: new Date('2026-05-10T12:00:00Z'),
  items: [],
}

const mockInProgressSession = {
  id: 'session_in_progress_1',
  magicLinkId: 'ml_1',
  reviewerId: null,
  reviewer: null,
  status: 'in_progress',
  round: 2,
  startedAt: new Date('2026-05-12T10:00:00Z'),
  submittedAt: null,
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
    vi.mocked(listSessionsForBatch).mockResolvedValue([])
    vi.mocked(db.post.findMany).mockResolvedValue([] as never)
    vi.mocked(db.magicLink.findMany).mockResolvedValue([] as never)
    vi.mocked(db.user.findUnique).mockResolvedValue(null as never)
    vi.mocked(db.user.findMany).mockResolvedValue([] as never)
    vi.mocked(db.client.findUnique).mockResolvedValue(null as never)
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

  // ---- Header "View client feedback" button ----

  describe('view-client-feedback-header button', () => {
    it('renders when a submitted review session is present and links to its detail page', async () => {
      vi.mocked(listSessionsForBatch).mockResolvedValue([
        mockSubmittedSession,
      ] as never)

      const { getByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
      })

      const btn = getByTestId('view-client-feedback-header')
      expect(btn).toBeTruthy()
      expect(btn.getAttribute('href')).toContain(
        `/review-sessions/${mockSubmittedSession.id}`,
      )
    })

    it('links to the latest submitted session when multiple submitted sessions exist', async () => {
      const olderSubmitted = {
        ...mockSubmittedSession,
        id: 'session_submitted_older',
        round: 1,
        submittedAt: new Date('2026-05-08T12:00:00Z'),
      }
      const newerSubmitted = {
        ...mockSubmittedSession,
        id: 'session_submitted_newer',
        round: 2,
        submittedAt: new Date('2026-05-12T12:00:00Z'),
      }
      // Repo orders by submittedAt desc — newest first.
      vi.mocked(listSessionsForBatch).mockResolvedValue([
        newerSubmitted,
        olderSubmitted,
      ] as never)

      const { getByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
      })

      const btn = getByTestId('view-client-feedback-header')
      expect(btn.getAttribute('href')).toContain(
        `/review-sessions/${newerSubmitted.id}`,
      )
    })

    it('does not render when no submitted session exists (only in_progress)', async () => {
      vi.mocked(listSessionsForBatch).mockResolvedValue([
        mockInProgressSession,
      ] as never)

      const { queryByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
      })

      expect(queryByTestId('view-client-feedback-header')).toBeNull()
    })

    it('does not render when there are no review sessions at all', async () => {
      vi.mocked(listSessionsForBatch).mockResolvedValue([])

      const { queryByTestId } = await renderPage({
        id: 'client_1',
        batchId: 'batch_1',
      })

      expect(queryByTestId('view-client-feedback-header')).toBeNull()
    })
  })
})
