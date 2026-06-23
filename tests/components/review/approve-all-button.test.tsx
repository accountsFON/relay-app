import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ApproveAllButton } from '@/components/review/approve-all-button'

describe('ApproveAllButton', () => {
  it('renders the count label and fires onApproveAll on click', () => {
    const onApproveAll = vi.fn()
    render(
      <ApproveAllButton
        totalPosts={3}
        allApproved={false}
        pending={false}
        onApproveAll={onApproveAll}
      />,
    )
    const btn = screen.getByTestId('approve-all-button')
    expect(btn).toHaveTextContent('Approve all 3 posts')
    fireEvent.click(btn)
    expect(onApproveAll).toHaveBeenCalledTimes(1)
  })

  it('shows Approving… and is disabled while pending', () => {
    render(
      <ApproveAllButton
        totalPosts={3}
        allApproved={false}
        pending
        onApproveAll={() => {}}
      />,
    )
    const btn = screen.getByTestId('approve-all-button')
    expect(btn).toHaveTextContent(/approving/i)
    expect(btn).toBeDisabled()
  })

  it('is disabled when all posts are already approved', () => {
    render(
      <ApproveAllButton
        totalPosts={3}
        allApproved
        pending={false}
        onApproveAll={() => {}}
      />,
    )
    expect(screen.getByTestId('approve-all-button')).toBeDisabled()
  })

  it('renders nothing for a single post', () => {
    render(
      <ApproveAllButton
        totalPosts={1}
        allApproved={false}
        pending={false}
        onApproveAll={() => {}}
      />,
    )
    expect(screen.queryByTestId('approve-all-button')).not.toBeInTheDocument()
  })
})
