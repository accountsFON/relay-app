import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PostCard } from '@/components/posts/post-card'
import {
  PostListCollapseProvider,
  PostListExpandAllToggle,
} from '@/components/posts/post-list-collapse'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/server/actions/posts', () => ({
  updatePostAction: vi.fn(),
}))

vi.mock('@/app/(app)/trash/actions', () => ({
  archivePostAction: vi.fn(),
  restorePostAction: vi.fn(),
}))

const basePost = {
  id: 'post-1',
  postDate: new Date('2026-05-12T12:00:00Z'),
  caption: 'A wonderful caption that should be visible when expanded.',
  hashtags: ['#hello', '#world'],
  graphicHook: 'The hook line',
  designerNotes: 'Use the blue palette',
  deletedAt: null,
}

describe('PostCard collapsed state', () => {
  it('defaults to collapsed and renders the slim header strip', () => {
    render(<PostCard post={basePost} />)
    // Caption preview is shown
    expect(
      screen.getByText(/A wonderful caption that should be visible/i),
    ).toBeInTheDocument()
    // Edit / Copy / overflow buttons are hidden when collapsed
    expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    // The collapsed root carries the data attribute
    expect(
      document.querySelector('[data-post-id="post-1"][data-collapsed="1"]'),
    ).not.toBeNull()
  })

  it('expands when the chevron toggle is clicked', () => {
    render(<PostCard post={basePost} canEdit />)
    const toggle = screen.getByRole('button', { name: /expand post/i })
    fireEvent.click(toggle)
    // Once expanded, Copy and Edit buttons appear
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    // Toggle now reads Collapse
    expect(screen.getByRole('button', { name: /collapse post/i })).toBeInTheDocument()
  })

  it('renders the post number badge when supplied', () => {
    render(<PostCard post={basePost} postNumber={3} />)
    expect(screen.getByText('#3')).toBeInTheDocument()
  })

  it('honors a controlled collapsed=false prop', () => {
    render(<PostCard post={basePost} collapsed={false} canEdit />)
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })
})

describe('PostListCollapseProvider', () => {
  const posts = [
    { ...basePost, id: 'a', caption: 'Caption A' },
    { ...basePost, id: 'b', caption: 'Caption B' },
  ]

  it('expands every card when Expand all is clicked', () => {
    render(
      <PostListCollapseProvider postIds={posts.map((p) => p.id)}>
        <PostListExpandAllToggle />
        {posts.map((p, idx) => (
          <PostCard key={p.id} post={p} postNumber={idx + 1} canEdit />
        ))}
      </PostListCollapseProvider>,
    )

    expect(screen.getByRole('button', { name: 'Expand all' })).toBeInTheDocument()
    // Initially collapsed: no Edit buttons rendered for either card
    expect(screen.queryAllByRole('button', { name: 'Edit' })).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }))

    // Both cards now expanded
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2)
    // Toggle flips to Collapse all
    expect(screen.getByRole('button', { name: 'Collapse all' })).toBeInTheDocument()
  })

  it('lets individual cards re-collapse after Expand all', () => {
    render(
      <PostListCollapseProvider postIds={posts.map((p) => p.id)}>
        <PostListExpandAllToggle />
        {posts.map((p, idx) => (
          <PostCard key={p.id} post={p} postNumber={idx + 1} canEdit />
        ))}
      </PostListCollapseProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }))
    // After expand all, "Collapse post" buttons exist for each card
    const collapseButtons = screen.getAllByRole('button', { name: /collapse post/i })
    expect(collapseButtons).toHaveLength(2)

    // Collapse just the first card
    fireEvent.click(collapseButtons[0])
    // Now only one Edit button remains visible (second card still expanded)
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1)
    // Global toggle is back to Expand all (not all expanded any more)
    expect(screen.getByRole('button', { name: 'Expand all' })).toBeInTheDocument()
  })

  it('collapses every card when Collapse all is clicked', () => {
    render(
      <PostListCollapseProvider postIds={posts.map((p) => p.id)}>
        <PostListExpandAllToggle />
        {posts.map((p, idx) => (
          <PostCard key={p.id} post={p} postNumber={idx + 1} canEdit />
        ))}
      </PostListCollapseProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }))
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }))

    expect(screen.queryAllByRole('button', { name: 'Edit' })).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Expand all' })).toBeInTheDocument()
  })
})
