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
  it('defaults to expanded and renders the full body', () => {
    render(<PostCard post={basePost} canEdit />)
    // Caption is shown
    expect(
      screen.getByText(/A wonderful caption that should be visible/i),
    ).toBeInTheDocument()
    // Copy and Edit buttons are visible when expanded
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    // The expanded root does NOT carry the collapsed data attribute
    expect(
      document.querySelector('[data-post-id="post-1"][data-collapsed="1"]'),
    ).toBeNull()
    // Chevron toggle reads Collapse on initial render
    expect(
      screen.getByRole('button', { name: /collapse post/i }),
    ).toBeInTheDocument()
  })

  it('collapses when the chevron toggle is clicked', () => {
    render(<PostCard post={basePost} canEdit />)
    const toggle = screen.getByRole('button', { name: /collapse post/i })
    fireEvent.click(toggle)
    // Once collapsed, Copy and Edit buttons disappear
    expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    // Toggle now reads Expand
    expect(screen.getByRole('button', { name: /expand post/i })).toBeInTheDocument()
  })

  it('honors a controlled collapsed=true prop', () => {
    render(<PostCard post={basePost} collapsed canEdit />)
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(
      document.querySelector('[data-post-id="post-1"][data-collapsed="1"]'),
    ).not.toBeNull()
  })

  it('renders the post number badge when supplied', () => {
    render(<PostCard post={basePost} postNumber={3} />)
    expect(screen.getByText('#3')).toBeInTheDocument()
  })

})

describe('PostListCollapseProvider', () => {
  const posts = [
    { ...basePost, id: 'a', caption: 'Caption A' },
    { ...basePost, id: 'b', caption: 'Caption B' },
  ]

  it('starts with every card expanded and surfaces a Collapse all toggle', () => {
    render(
      <PostListCollapseProvider postIds={posts.map((p) => p.id)}>
        <PostListExpandAllToggle />
        {posts.map((p, idx) => (
          <PostCard key={p.id} post={p} postNumber={idx + 1} canEdit />
        ))}
      </PostListCollapseProvider>,
    )

    // Both cards expanded on initial render
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2)
    // Global toggle reads Collapse all
    expect(screen.getByRole('button', { name: 'Collapse all' })).toBeInTheDocument()
  })

  it('collapses every card when Collapse all is clicked, then expands again', () => {
    render(
      <PostListCollapseProvider postIds={posts.map((p) => p.id)}>
        <PostListExpandAllToggle />
        {posts.map((p, idx) => (
          <PostCard key={p.id} post={p} postNumber={idx + 1} canEdit />
        ))}
      </PostListCollapseProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }))
    expect(screen.queryAllByRole('button', { name: 'Edit' })).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Expand all' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }))
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Collapse all' })).toBeInTheDocument()
  })

  it('lets individual cards re-collapse without affecting the other', () => {
    render(
      <PostListCollapseProvider postIds={posts.map((p) => p.id)}>
        <PostListExpandAllToggle />
        {posts.map((p, idx) => (
          <PostCard key={p.id} post={p} postNumber={idx + 1} canEdit />
        ))}
      </PostListCollapseProvider>,
    )

    // Both expanded by default, so both rows have a Collapse post toggle.
    const collapseButtons = screen.getAllByRole('button', { name: /collapse post/i })
    expect(collapseButtons).toHaveLength(2)

    // Collapse just the first card.
    fireEvent.click(collapseButtons[0])
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1)
    // Global toggle flips to Expand all once not every card is expanded.
    expect(screen.getByRole('button', { name: 'Expand all' })).toBeInTheDocument()
  })
})
