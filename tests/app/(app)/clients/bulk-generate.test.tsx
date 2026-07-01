import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BulkGenerateList } from '@/app/(app)/clients/bulk-generate'

vi.mock('@/app/(app)/clients/run-actions', () => ({
  bulkGenerateContent: vi.fn(),
}))

vi.mock('@/components/relay/in-flight-runs-provider', () => ({
  useInFlightRuns: () => ({ runs: [], refresh: vi.fn() }),
}))

vi.mock('@/components/relay/in-flight-runs-utils', () => ({
  stepLabel: vi.fn(() => 'Processing'),
}))

vi.mock('@/lib/batch-target-month', () => ({
  formatMonthYear: (s: string) => s,
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

const onboardedClient = {
  id: 'client-onboarded',
  name: 'Onboarded Client',
  status: 'active',
  industry: 'Tech',
  location: 'Atlanta',
  isArchived: false,
  onboardingComplete: true,
}

const notOnboardedClient = {
  id: 'client-not-onboarded',
  name: 'Not Onboarded Client',
  status: 'active',
  industry: 'Retail',
  location: 'Miami',
  isArchived: false,
  onboardingComplete: false,
}

describe('BulkGenerateList — onboarding gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a checkbox for an onboarded active client', () => {
    render(<BulkGenerateList clients={[onboardedClient]} />)
    expect(screen.getByLabelText(/select onboarded client/i)).toBeTruthy()
  })

  it('renders NO checkbox for a not-onboarded active client', () => {
    render(<BulkGenerateList clients={[notOnboardedClient]} />)
    expect(screen.queryByLabelText(/select not onboarded client/i)).toBeNull()
  })

  it('shows "Needs onboarding" badge for a not-onboarded active client', () => {
    render(<BulkGenerateList clients={[notOnboardedClient]} />)
    expect(screen.getByText('Needs onboarding')).toBeTruthy()
  })

  it('"Select all active" selects only onboarded clients', async () => {
    const user = userEvent.setup()
    render(<BulkGenerateList clients={[onboardedClient, notOnboardedClient]} />)

    await act(async () => {
      await user.click(screen.getByText('Select all active'))
    })

    expect(screen.getByText('1 client selected')).toBeTruthy()
  })
})
