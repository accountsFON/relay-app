import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import {
  UnsavedChangesProvider,
  useUnsavedChanges,
  useHasUnsavedChanges,
} from '@/lib/unsaved-changes'

function Editor({ dirty }: { dirty: boolean }) {
  useUnsavedChanges(dirty)
  return null
}

function Probe() {
  return <span data-testid="probe">{useHasUnsavedChanges() ? 'dirty' : 'clean'}</span>
}

describe('useUnsavedChanges registry', () => {
  it('is clean with no dirty editors', () => {
    render(
      <UnsavedChangesProvider>
        <Editor dirty={false} />
        <Probe />
      </UnsavedChangesProvider>,
    )
    expect(screen.getByTestId('probe').textContent).toBe('clean')
  })

  it('reports dirty when any editor is dirty', () => {
    render(
      <UnsavedChangesProvider>
        <Editor dirty={false} />
        <Editor dirty={true} />
        <Probe />
      </UnsavedChangesProvider>,
    )
    expect(screen.getByTestId('probe').textContent).toBe('dirty')
  })

  it('returns to clean when a dirty editor unmounts', () => {
    function Harness({ show }: { show: boolean }) {
      return (
        <UnsavedChangesProvider>
          {show && <Editor dirty={true} />}
          <Probe />
        </UnsavedChangesProvider>
      )
    }
    const { rerender } = render(<Harness show={true} />)
    expect(screen.getByTestId('probe').textContent).toBe('dirty')
    act(() => rerender(<Harness show={false} />))
    expect(screen.getByTestId('probe').textContent).toBe('clean')
  })

  it('does not throw without a provider', () => {
    expect(() => render(<Editor dirty={true} />)).not.toThrow()
  })
})
