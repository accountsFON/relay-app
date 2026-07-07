import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { NextActionBoard } from '@/components/relay/next-action-board'
import type { NextAction } from '@/lib/relay-next-action'

describe('NextActionBoard', () => {
  it('renders an internal off-page button as a link to that href', () => {
    const action: NextAction = {
      tone: 'action',
      title: 'Review the designs',
      detail: 'Approve or request changes.',
      button: { label: 'Review designs', href: '/clients/c/batches/b/preview' },
    }
    const { getByRole, getByText } = render(<NextActionBoard action={action} />)
    expect(getByText('Review the designs')).toBeTruthy()
    expect(getByText('Approve or request changes.')).toBeTruthy()
    const link = getByRole('link', { name: /review designs/i })
    expect(link).toHaveAttribute('href', '/clients/c/batches/b/preview')
    // Internal links must not open in a new tab.
    expect(link).not.toHaveAttribute('target', '_blank')
  })

  it('P1 #19: renders data-action-board with the anchorId so notifications can deep-link to it', () => {
    const action: NextAction = {
      tone: 'action',
      title: 'Review the designs',
      button: { label: 'Review designs', href: '/clients/c/batches/b/preview' },
    }
    const { getByTestId, rerender } = render(<NextActionBoard action={action} anchorId="b1" />)
    expect(getByTestId('next-action-board')).toHaveAttribute('data-action-board', 'b1')
    // No anchorId -> no anchor attribute (the board is unaddressable off this page).
    rerender(<NextActionBoard action={action} />)
    expect(getByTestId('next-action-board')).not.toHaveAttribute('data-action-board')
  })

  it('opens an external (http) button in a new tab with rel noopener', () => {
    const action: NextAction = {
      tone: 'action',
      title: 'Schedule the approved posts',
      button: { label: 'Go to NectrCRM', href: 'https://app.nectrcrm.com' },
    }
    const { getByRole } = render(<NextActionBoard action={action} />)
    const link = getByRole('link', { name: /go to nectrcrm/i })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders a secondary button when present', () => {
    const action: NextAction = {
      tone: 'action',
      title: 'Revise the designs',
      button: { label: 'Open internal review', href: '/clients/c/batches/b/preview' },
      secondaryButton: { label: 'Open client content', href: 'https://drive.example/f' },
    }
    const { getByRole } = render(<NextActionBoard action={action} />)
    expect(getByRole('link', { name: /open internal review/i })).toBeTruthy()
    const secondary = getByRole('link', { name: /open client content/i })
    expect(secondary).toHaveAttribute('href', 'https://drive.example/f')
    expect(secondary).toHaveAttribute('target', '_blank')
  })

  it('renders a waiting state with the title and no button', () => {
    const action: NextAction = {
      tone: 'waiting',
      title: 'Waiting on design revisions',
    }
    const { getByText, queryByRole } = render(<NextActionBoard action={action} />)
    expect(getByText('Waiting on design revisions')).toBeTruthy()
    expect(queryByRole('link')).toBeNull()
  })

  it('renders a done note with no button', () => {
    const action: NextAction = {
      tone: 'done',
      title: 'This relay is complete',
    }
    const { getByText, queryByRole } = render(<NextActionBoard action={action} />)
    expect(getByText('This relay is complete')).toBeTruthy()
    expect(queryByRole('link')).toBeNull()
  })
})
