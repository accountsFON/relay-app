import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(app)/clients/[id]/activity/actions', () => ({
  clearAllMentionsAction: vi.fn().mockResolvedValue(undefined),
}))

import { clearAllMentionsAction } from '@/app/(app)/clients/[id]/activity/actions'
import { ClearAllButton } from '@/app/(app)/inbox/clear-all-button'

describe('ClearAllButton', () => {
  beforeEach(() => vi.clearAllMocks())

  it('opens a confirm dialog and clears on confirm', () => {
    render(<ClearAllButton count={7} unreadCount={3} />)
    fireEvent.click(screen.getByRole('button', { name: /^clear all$/i }))
    expect(screen.getByText(/7 notifications/i)).toBeInTheDocument()
    expect(screen.getByText(/3 unread/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /clear all notifications/i }))
    expect(clearAllMentionsAction).toHaveBeenCalledTimes(1)
  })

  it('does not clear when cancelled', () => {
    render(<ClearAllButton count={2} unreadCount={0} />)
    fireEvent.click(screen.getByRole('button', { name: /^clear all$/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(clearAllMentionsAction).not.toHaveBeenCalled()
  })
})
