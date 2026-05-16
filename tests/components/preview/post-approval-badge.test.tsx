import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PostApprovalBadge } from '@/components/preview/post-approval-badge'

describe('PostApprovalBadge', () => {
  it('renders the ready state with the green check label and tooltip', () => {
    render(<PostApprovalBadge status="ready" />)

    const badge = screen.getByTestId('post-approval-badge')
    expect(badge.getAttribute('data-status')).toBe('ready')
    expect(badge.getAttribute('title')).toBe('Ready: no open threads')
    expect(badge.textContent).toContain('Ready')
  })

  it('renders the pending state with an open thread count in the tooltip', () => {
    render(<PostApprovalBadge status="pending" openThreadCount={3} />)

    const badge = screen.getByTestId('post-approval-badge')
    expect(badge.getAttribute('data-status')).toBe('pending')
    expect(badge.getAttribute('title')).toBe('Pending: 3 open threads')
    expect(badge.textContent).toContain('Pending')
  })
})
