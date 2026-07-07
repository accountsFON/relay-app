import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('@/server/repositories/batches', () => ({
  listBatchesForOrg: vi.fn(),
  listClientPipelineBatches: vi.fn(),
}))

vi.mock('@/server/repositories/contentRuns', () => ({
  getMonthlyCostSummary: vi.fn(),
}))

vi.mock('@/db/client', () => ({
  db: {
    relayEvent: { groupBy: vi.fn().mockResolvedValue([]) },
  },
}))

vi.mock('@/components/dashboard/access-denied-toast', () => ({
  AccessDeniedToast: () => <div data-testid="access-denied-toast-stub" />,
}))

vi.mock('@/components/dashboard/client-no-access-state', () => ({
  ClientNoAccessState: () => <div data-testid="client-no-access-stub" />,
}))

vi.mock('@/components/hero-band', () => ({
  HeroBand: (props: { title: string }) => (
    <div data-testid="hero-band-stub" data-title={props.title} />
  ),
}))

vi.mock('@/components/relay/dashboard-relay-track', () => ({
  DashboardRelayTrack: ({
    stations,
  }: {
    stations: Array<{ step: string; relays: Array<{ id: string }> }>
  }) => (
    <div data-testid="dashboard-relay-track-stub">
      {stations.map((s) => (
        <div key={s.step} data-testid={`track-station-${s.step}`}>
          {s.relays.map((r) => r.id).join(',')}
        </div>
      ))}
    </div>
  ),
}))

vi.mock('@/components/relay/dashboard-select-mode', () => ({
  DashboardSelectMode: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

import { DesignerDashboard } from '@/app/(app)/dashboard/page'
import { listBatchesForOrg } from '@/server/repositories/batches'

const designerCtx = {
  organizationDbId: 'org_db_1',
  userDbId: 'designer_1',
}

function batch(overrides: Record<string, unknown>) {
  return {
    id: 'batch_x',
    clientId: 'client_1',
    label: 'May 2026',
    currentStep: 'in_design',
    currentSubState: null,
    createdAt: new Date('2026-05-01T00:00:00Z'),
    deletedAt: null,
    client: { name: 'Demo Client', assignedDesignerId: 'designer_1', assignedAmId: null },
    holder: { id: 'designer_1', name: 'Dee Designer', avatarUrl: null },
    ...overrides,
  }
}

async function renderPage() {
  const ui = await DesignerDashboard({ ctx: designerCtx })
  return render(ui)
}

describe('DashboardPage — designer awaiting revisions tile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows an "Awaiting your revisions" tile for am_review_design + awaiting_design_revisions', async () => {
    vi.mocked(listBatchesForOrg).mockResolvedValue([
      batch({
        id: 'batch_rev',
        currentStep: 'am_review_design',
        currentSubState: 'awaiting_design_revisions',
      }),
    ] as never)

    const { getByText, container } = await renderPage()
    expect(getByText(/awaiting your revisions/i)).toBeTruthy()
    // Tile links to the batch relay page.
    const link = container.querySelector('a[href="/clients/client_1/batches/batch_rev"]')
    expect(link).not.toBeNull()
  })

  it('does NOT list an am_review_design (default sub-state) batch in the Awaiting your revisions tile', async () => {
    vi.mocked(listBatchesForOrg).mockResolvedValue([
      batch({
        id: 'batch_review',
        currentStep: 'am_review_design',
        currentSubState: null,
      }),
    ] as never)

    const { queryByText, container } = await renderPage()
    expect(queryByText(/awaiting your revisions/i)).toBeNull()
    expect(
      container.querySelector('a[href="/clients/client_1/batches/batch_review"]'),
    ).toBeNull()
  })
})

describe('DashboardPage — designer full lifecycle track', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('buckets the designer\'s relays at every live step, not just in_design', async () => {
    vi.mocked(listBatchesForOrg).mockResolvedValue([
      batch({ id: 'batch_copy', currentStep: 'copy' }),
      batch({ id: 'batch_design', currentStep: 'in_design' }),
      batch({ id: 'batch_client', currentStep: 'client_review' }),
      batch({ id: 'batch_sched', currentStep: 'scheduling' }),
      batch({ id: 'batch_done', currentStep: 'completed' }),
    ] as never)

    const { getByTestId } = await renderPage()
    expect(getByTestId('track-station-copy').textContent).toContain('batch_copy')
    expect(getByTestId('track-station-in_design').textContent).toContain('batch_design')
    expect(getByTestId('track-station-client_review').textContent).toContain('batch_client')
    expect(getByTestId('track-station-scheduling').textContent).toContain('batch_sched')
    expect(getByTestId('track-station-completed').textContent).toContain('batch_done')
  })

  it('does not include relays on another designer\'s clients', async () => {
    vi.mocked(listBatchesForOrg).mockResolvedValue([
      batch({ id: 'mine', currentStep: 'copy' }),
      batch({
        id: 'theirs',
        currentStep: 'copy',
        client: { name: 'Other Client', assignedDesignerId: 'designer_2', assignedAmId: null },
      }),
    ] as never)

    const { getByTestId } = await renderPage()
    const copyStation = getByTestId('track-station-copy').textContent ?? ''
    expect(copyStation).toContain('mine')
    expect(copyStation).not.toContain('theirs')
  })
})
