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

vi.mock('@vercel/blob/client', () => ({
  upload: vi.fn(),
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

  it('renders the action buttons inside tooltip triggers when expanded', () => {
    render(<PostCard post={basePost} canEdit />)
    // Buttons remain queryable by role + name even though they are now
    // wrapped in SimpleTooltip. Base UI's TooltipTrigger uses render so the
    // underlying Button is what actually mounts.
    const copyButton = screen.getByRole('button', { name: 'Copy' })
    const editButton = screen.getByRole('button', { name: 'Edit' })
    expect(copyButton).toBeInTheDocument()
    expect(editButton).toBeInTheDocument()
    // The trigger button carries data-slot from the Tooltip primitive when
    // it is the tooltip trigger.
    expect(copyButton.getAttribute('data-slot')).toBe('tooltip-trigger')
    expect(editButton.getAttribute('data-slot')).toBe('tooltip-trigger')
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

describe('PostCard QA-edited indicator', () => {
  it('renders the QA indicator when preQaCaption is set', () => {
    const post = { ...basePost, preQaCaption: 'original cheap version' }
    render(<PostCard post={post} canEdit />)
    expect(screen.getByText('Edited by QA bot')).toBeInTheDocument()
  })

  it('does not render the QA indicator when preQaCaption is null', () => {
    const post = { ...basePost, preQaCaption: null }
    render(<PostCard post={post} canEdit />)
    expect(screen.queryByText('Edited by QA bot')).not.toBeInTheDocument()
  })
})

describe('PostCard image section', () => {
  it('editor with no image sees the upload dropzone', () => {
    render(<PostCard post={basePost} canEdit mediaUrl={null} />)
    expect(screen.getByTestId('media-upload-dropzone')).toBeInTheDocument()
    expect(screen.queryByTestId('post-image-readonly')).not.toBeInTheDocument()
  })

  it('editor with an image sees the image plus replace/remove control', () => {
    render(
      <PostCard
        post={basePost}
        canEdit
        mediaUrl="https://blob.test/post-media/post-1/x.png"
      />,
    )
    expect(screen.getByTestId('media-upload-current')).toBeInTheDocument()
    expect(screen.getByTestId('media-upload-remove')).toBeInTheDocument()
  })

  it('non editor with an image sees the image read only, no controls', () => {
    render(
      <PostCard
        post={basePost}
        canEdit={false}
        mediaUrl="https://blob.test/post-media/post-1/x.png"
      />,
    )
    const img = screen.getByTestId('post-image-readonly')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute(
      'src',
      'https://blob.test/post-media/post-1/x.png',
    )
    expect(screen.queryByTestId('media-upload-remove')).not.toBeInTheDocument()
    expect(screen.queryByTestId('media-upload-dropzone')).not.toBeInTheDocument()
  })

  it('non editor with no image sees no image section', () => {
    render(<PostCard post={basePost} canEdit={false} mediaUrl={null} />)
    expect(screen.queryByTestId('post-image-readonly')).not.toBeInTheDocument()
    expect(screen.queryByTestId('media-upload-dropzone')).not.toBeInTheDocument()
  })

  it('hides the image section when the card is collapsed', () => {
    render(
      <PostCard
        post={basePost}
        collapsed
        canEdit
        mediaUrl="https://blob.test/post-media/post-1/x.png"
      />,
    )
    expect(screen.queryByTestId('media-upload-current')).not.toBeInTheDocument()
    expect(screen.queryByTestId('media-upload-dropzone')).not.toBeInTheDocument()
  })

  it('hides the image section on an archived post', () => {
    render(
      <PostCard
        post={{ ...basePost, deletedAt: new Date('2026-05-20T00:00:00Z') }}
        canEdit
        mediaUrl="https://blob.test/post-media/post-1/x.png"
      />,
    )
    expect(screen.queryByTestId('media-upload-current')).not.toBeInTheDocument()
    expect(screen.queryByTestId('media-upload-dropzone')).not.toBeInTheDocument()
    expect(screen.queryByTestId('post-image-readonly')).not.toBeInTheDocument()
  })
})
