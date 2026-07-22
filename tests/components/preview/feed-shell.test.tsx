import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FeedShell } from '@/components/preview/feed-shell'

describe('FeedShell', () => {
  it('renders the "Social Preview" heading, not a platform toggle', () => {
    render(
      <FeedShell>
        <div data-testid="child-post">post</div>
      </FeedShell>,
    )
    expect(screen.getByRole('heading', { name: 'Social Preview' })).toBeTruthy()
    // The Instagram/Facebook toggle (a radiogroup) is gone.
    expect(screen.queryByRole('radiogroup', { name: 'Preview platform' })).toBeNull()
  })

  it('renders its children below the heading', () => {
    render(
      <FeedShell>
        <div data-testid="child-post">post</div>
      </FeedShell>,
    )
    expect(screen.getByTestId('child-post')).toBeTruthy()
  })
})
