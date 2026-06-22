import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RelayStep } from '@prisma/client'
import { DashboardRelayTrack } from '@/components/relay/dashboard-relay-track'
import type { RunnerRelay } from '@/components/relay/relay-runner-card'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

function relay(overrides: Partial<RunnerRelay> = {}): RunnerRelay {
  return {
    id: 'batch-1',
    clientId: 'client-1',
    clientName: 'Acme Co',
    label: 'May 2026',
    daysOnStep: 1,
    holder: { id: 'u1', name: 'Morgan' },
    lastTransitionAt: null,
    ...overrides,
  }
}

describe('DashboardRelayTrack', () => {
  it('renders a confident empty state when no relays are on the track', () => {
    render(
      <DashboardRelayTrack
        stations={[
          { step: RelayStep.copy, relays: [] },
          { step: RelayStep.in_design, relays: [] },
        ]}
        viewerRole="am"
      />,
    )
    expect(screen.getByText(/no relays on the track\./i)).toBeInTheDocument()
    expect(screen.getByText(/start one from a client profile/i)).toBeInTheDocument()
  })

  it('renders a designer-flavored empty state for the designer view', () => {
    render(
      <DashboardRelayTrack
        stations={[{ step: RelayStep.in_design, relays: [] }]}
        viewerRole="designer"
      />,
    )
    expect(screen.getByText(/no relays on the track\./i)).toBeInTheDocument()
    expect(
      screen.getByText(/when an am passes a relay to design/i),
    ).toBeInTheDocument()
  })

  it('renders one station per provided step with its readable label', () => {
    render(
      <DashboardRelayTrack
        stations={[
          { step: RelayStep.copy, relays: [relay({ id: 'b1' })] },
          { step: RelayStep.in_design, relays: [] },
          { step: RelayStep.final_qa_schedule, relays: [] },
        ]}
        viewerRole="am"
      />,
    )
    // Each step label appears twice (desktop + mobile layouts).
    expect(screen.getAllByText('Copy Review').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Initial Design').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Final QA and schedule').length).toBeGreaterThan(0)
  })

  it('renders each runner card inside its station', () => {
    render(
      <DashboardRelayTrack
        stations={[
          {
            step: RelayStep.copy,
            relays: [
              relay({ id: 'b1', clientName: 'Northeast HVAC' }),
              relay({ id: 'b2', clientName: 'Effect MedSpa' }),
            ],
          },
          { step: RelayStep.in_design, relays: [] },
        ]}
        viewerRole="am"
      />,
    )
    // Desktop + mobile both render the cards, so each name shows up twice.
    expect(screen.getAllByText('Northeast HVAC').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Effect MedSpa').length).toBeGreaterThanOrEqual(1)
  })

  it('highlights stations holding a recently passed relay', () => {
    const now = new Date('2026-05-12T12:00:00Z')
    const recent = new Date('2026-05-12T11:00:00Z') // 1h ago
    const { container } = render(
      <DashboardRelayTrack
        stations={[
          {
            step: RelayStep.copy,
            relays: [relay({ id: 'b1', lastTransitionAt: recent })],
          },
          { step: RelayStep.in_design, relays: [] },
        ]}
        viewerRole="am"
        now={now}
      />,
    )
    const activeStations = container.querySelectorAll(
      '[data-step="copy"][data-active="true"]',
    )
    expect(activeStations.length).toBeGreaterThan(0)
  })

  it('does not highlight stations whose only relays moved more than 24h ago', () => {
    const now = new Date('2026-05-12T12:00:00Z')
    const stale = new Date('2026-05-10T11:00:00Z')
    const { container } = render(
      <DashboardRelayTrack
        stations={[
          {
            step: RelayStep.copy,
            relays: [relay({ id: 'b1', lastTransitionAt: stale })],
          },
        ]}
        viewerRole="am"
        now={now}
      />,
    )
    const activeStations = container.querySelectorAll(
      '[data-step="copy"][data-active="true"]',
    )
    expect(activeStations.length).toBe(0)
  })

  it('shows the per-station count in a chip', () => {
    render(
      <DashboardRelayTrack
        stations={[
          {
            step: RelayStep.copy,
            relays: [
              relay({ id: 'b1' }),
              relay({ id: 'b2' }),
              relay({ id: 'b3' }),
            ],
          },
        ]}
        viewerRole="am"
      />,
    )
    // 3 relays at the Copy station, label appears in both desktop + mobile.
    const countChips = screen.getAllByLabelText(/3 relays at this step/i)
    expect(countChips.length).toBeGreaterThan(0)
  })
})
