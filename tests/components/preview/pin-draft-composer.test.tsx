import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { PinDraftComposer } from '@/components/preview/pin-draft-composer'

describe('PinDraftComposer discard warning', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('warns before discarding a non-empty draft on outside click', () => {
    const onCancel = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(
      <PinDraftComposer
        anchor={{ x: 100, y: 100 }}
        onSubmit={async () => {}}
        onCancel={onCancel}
      />,
    )

    fireEvent.change(screen.getByTestId('pin-draft-composer-input'), {
      target: { value: 'draft text' },
    })
    fireEvent.mouseDown(document.body)

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('cancels a non-empty draft when the discard is confirmed', () => {
    const onCancel = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(
      <PinDraftComposer
        anchor={{ x: 100, y: 100 }}
        onSubmit={async () => {}}
        onCancel={onCancel}
      />,
    )

    fireEvent.change(screen.getByTestId('pin-draft-composer-input'), {
      target: { value: 'draft text' },
    })
    fireEvent.mouseDown(document.body)

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('cancels an empty draft with no confirm prompt', () => {
    const onCancel = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm')
    render(
      <PinDraftComposer
        anchor={{ x: 100, y: 100 }}
        onSubmit={async () => {}}
        onCancel={onCancel}
      />,
    )

    fireEvent.mouseDown(document.body)

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
