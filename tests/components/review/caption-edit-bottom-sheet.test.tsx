import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CaptionEditBottomSheet } from '@/components/review/caption-edit-bottom-sheet'

const ORIGINAL = 'Spring sale this weekend. 10% off everything.'

describe('CaptionEditBottomSheet', () => {
  it('renders original collapsed by default and expands on click', () => {
    render(
      <CaptionEditBottomSheet
        open
        originalCaption={ORIGINAL}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const toggle = screen.getByTestId('caption-edit-original-toggle')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.queryByTestId('caption-edit-original-body'),
    ).not.toBeInTheDocument()

    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const body = screen.getByTestId('caption-edit-original-body')
    expect(body).toBeInTheDocument()
    expect(body).toHaveTextContent(ORIGINAL)
  })

  it('save calls onSave with the textarea value', async () => {
    const onSave = vi.fn()
    const onCancel = vi.fn()

    render(
      <CaptionEditBottomSheet
        open
        originalCaption={ORIGINAL}
        onSave={onSave}
        onCancel={onCancel}
      />,
    )

    const textarea = screen.getByTestId(
      'caption-edit-textarea',
    ) as HTMLTextAreaElement
    const next = 'Spring sale, 15% off, this weekend only.'
    fireEvent.change(textarea, { target: { value: next } })

    const save = screen.getByTestId('caption-edit-save')
    expect(save).not.toBeDisabled()
    fireEvent.click(save)

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith(next)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('cancel calls onCancel without onSave', () => {
    const onSave = vi.fn()
    const onCancel = vi.fn()

    render(
      <CaptionEditBottomSheet
        open
        originalCaption={ORIGINAL}
        onSave={onSave}
        onCancel={onCancel}
      />,
    )

    fireEvent.click(screen.getByTestId('caption-edit-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('escape key triggers cancel', () => {
    const onSave = vi.fn()
    const onCancel = vi.fn()

    render(
      <CaptionEditBottomSheet
        open
        originalCaption={ORIGINAL}
        onSave={onSave}
        onCancel={onCancel}
      />,
    )

    const sheet = screen.getByTestId('caption-edit-sheet')
    fireEvent.keyDown(sheet, { key: 'Escape' })

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
  })
})
