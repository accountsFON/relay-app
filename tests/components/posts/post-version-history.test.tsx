import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

const restoreMock = vi.fn()
vi.mock('@/server/actions/posts', () => ({
  restorePostVersionAction: (id: string) => restoreMock(id),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { toast } from 'sonner'
import { PostVersionHistory } from '@/components/posts/post-version-history'

const versions = [
  {
    id: 'v1',
    caption: 'Full previous caption, line one.\nLine two of the caption.',
    hashtags: ['#alpha', '#beta'],
    graphicHook: 'Old graphic hook',
    designerNotes: 'Old designer notes',
    createdAt: new Date('2026-05-12T12:00:00Z'),
    authorName: 'Mollie',
  },
]

beforeEach(() => {
  refreshMock.mockReset()
  restoreMock.mockReset()
  restoreMock.mockResolvedValue(undefined)
})

describe('PostVersionHistory', () => {
  it('renders nothing when there are no versions', () => {
    const { container } = render(
      <PostVersionHistory postId="p1" versions={[]} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('expands a version row to reveal the entire previous post', () => {
    render(<PostVersionHistory postId="p1" versions={versions} />)
    // Open the history panel.
    fireEvent.click(screen.getByRole('button', { name: /1 version/i }))

    // Collapsed: the full hook, notes, and joined hashtags are not shown.
    expect(screen.queryByText('Old graphic hook')).not.toBeInTheDocument()
    expect(screen.queryByText('Old designer notes')).not.toBeInTheDocument()
    expect(screen.queryByText('#alpha #beta')).not.toBeInTheDocument()

    // Expand the version row.
    fireEvent.click(
      screen.getByRole('button', { name: /toggle details for version/i }),
    )

    // Expanded: the entire previous post is visible.
    expect(screen.getByText('Old graphic hook')).toBeInTheDocument()
    expect(screen.getByText('Old designer notes')).toBeInTheDocument()
    expect(screen.getByText('#alpha #beta')).toBeInTheDocument()
    expect(screen.getByText(/Line two of the caption/)).toBeInTheDocument()
  })

  it('restores a version and refreshes the view', async () => {
    render(<PostVersionHistory postId="p1" versions={versions} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: /1 version/i }))
    fireEvent.click(
      screen.getByRole('button', { name: /restore version from/i }),
    )
    expect(restoreMock).toHaveBeenCalledWith('v1')
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })

  it('hides the Restore button when canEdit is false (e.g. designer)', () => {
    render(<PostVersionHistory postId="p1" versions={versions} canEdit={false} />)
    fireEvent.click(screen.getByRole('button', { name: /1 version/i }))
    expect(
      screen.queryByRole('button', { name: /restore version from/i }),
    ).not.toBeInTheDocument()
  })

  it('shows the Restore button when canEdit is true', () => {
    render(<PostVersionHistory postId="p1" versions={versions} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: /1 version/i }))
    expect(
      screen.getByRole('button', { name: /restore version from/i }),
    ).toBeInTheDocument()
  })

  it('shows a friendly toast and does not throw when a restore fails', async () => {
    restoreMock.mockRejectedValueOnce(new Error('Error 67890'))
    render(<PostVersionHistory postId="p1" versions={versions} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: /1 version/i }))
    fireEvent.click(
      screen.getByRole('button', { name: /restore version from/i }),
    )
    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        "Couldn't restore that version. You may not have permission.",
      )
    })
  })
})
