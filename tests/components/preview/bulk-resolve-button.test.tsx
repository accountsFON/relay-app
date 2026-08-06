// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BulkResolveButton } from '@/components/preview/bulk-resolve-button'

vi.mock('@/server/actions/threads', () => ({
  bulkResolveOnPostAction: vi.fn(),
}))

describe('BulkResolveButton', () => {
  it('renders the trigger with the open-thread count', () => {
    render(<BulkResolveButton postId="p1" openThreadCount={3} />)
    const trigger = screen.getByTestId('bulk-resolve-button')
    expect(trigger).toHaveTextContent('Resolve all (3)')
  })
})
