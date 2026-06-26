import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { PinDraftComposer } from '@/components/preview/pin-draft-composer'
import type { MentionTarget } from '@/lib/mentions'

const ROSTER: MentionTarget[] = [
  { id: 'u1', name: 'Dan Designer', handle: 'dan.designer' },
  { id: 'u2', name: 'Amy Admin', handle: 'amy.admin' },
]

describe('PinDraftComposer @-mention autocomplete', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('shows roster suggestions when the user types @ (roster provided)', () => {
    render(
      <PinDraftComposer
        anchor={{ x: 100, y: 100 }}
        onSubmit={async () => {}}
        onCancel={() => {}}
        mentionRoster={ROSTER}
      />,
    )
    const input = screen.getByTestId('pin-draft-composer-input') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '@dan' } })
    // The matching roster member surfaces in the dropdown.
    expect(screen.getByRole('listbox', { name: /mention/i })).toBeInTheDocument()
    expect(screen.getByText('Dan Designer')).toBeInTheDocument()
  })

  it('renders NO autocomplete when no roster prop is passed (client-review parity)', () => {
    render(
      <PinDraftComposer
        anchor={{ x: 100, y: 100 }}
        onSubmit={async () => {}}
        onCancel={() => {}}
      />,
    )
    const input = screen.getByTestId('pin-draft-composer-input') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '@dan' } })
    expect(screen.queryByRole('listbox', { name: /mention/i })).toBeNull()
  })

  it('inserts the handle into the body when a suggestion is clicked', () => {
    render(
      <PinDraftComposer
        anchor={{ x: 100, y: 100 }}
        onSubmit={async () => {}}
        onCancel={() => {}}
        mentionRoster={ROSTER}
      />,
    )
    const input = screen.getByTestId('pin-draft-composer-input') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '@dan' } })
    fireEvent.mouseDown(screen.getByText('Dan Designer'))
    expect(input.value).toContain('@dan.designer')
  })
})
