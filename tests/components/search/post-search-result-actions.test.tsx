// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PostSearchResultActions } from '@/components/search/post-search-result-actions'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(app)/trash/actions', () => ({ archivePostAction: vi.fn() }))

describe('PostSearchResultActions', () => {
  it('still opens the menu when the tooltip-wrapped trigger is clicked', async () => {
    render(<PostSearchResultActions postId="p1" />)
    fireEvent.click(screen.getByRole('button', { name: /post options/i }))
    expect(await screen.findByText('Archive post')).toBeInTheDocument()
  })
})
