// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClientDecisionPanel } from '@/components/relay/client-decision-panel'
import type { BatchSummary } from '@/components/relay/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))
vi.mock('@/server/actions/relay', () => ({ passBatonAction: vi.fn() }))
vi.mock('@/app/(app)/clients/[id]/activity/actions', () => ({
  postCommentAction: vi.fn(),
}))

const batch = { id: 'b1', clientId: 'c1', label: 'August Batch' } as unknown as BatchSummary

describe('ClientDecisionPanel', () => {
  it('renders the Approve and Request changes actions in idle mode', () => {
    render(<ClientDecisionPanel batch={batch} />)
    expect(screen.getByText('Approve & schedule')).toBeInTheDocument()
    expect(screen.getByText('Request changes')).toBeInTheDocument()
  })
})
