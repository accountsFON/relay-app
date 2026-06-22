/**
 * Tests for the attach-image control wired into PinDraftComposer and PinPopover.
 *
 * Covers:
 *   - CommentImageAttachButton: renders attach button; rejects oversized files;
 *     calls onUploadImage on pick; shows thumbnail + remove; clears on remove.
 *   - PinDraftComposer with onUploadImage: attach button renders; after a
 *     stubbed upload, submit passes image arg; image-only submit is allowed
 *     (empty body); without onUploadImage no button is shown.
 *   - PinPopover with onUploadImage: attach button renders; after a stubbed
 *     upload, submit passes image to onComment; image-only comment is allowed.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommentImageAttachButton } from '@/components/preview/comment-image-attach-button'
import { PinDraftComposer } from '@/components/preview/pin-draft-composer'
import { PinPopover, type PinPopoverThread } from '@/components/preview/pin-popover'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(name = 'shot.png', size = 100, type = 'image/png'): File {
  const buf = new Uint8Array(size)
  return new File([buf], name, { type })
}

function makeThread(): PinPopoverThread {
  return {
    id: 't1',
    pin: { kind: 'image', x: 30, y: 40 },
    status: 'open',
    firstComment: {
      author: { kind: 'client', reviewerName: 'Sarah' },
      body: 'first comment',
      createdAt: new Date('2026-05-15T10:00:00Z'),
    },
    comments: [
      {
        author: { kind: 'client', reviewerName: 'Sarah' },
        body: 'first comment',
        createdAt: new Date('2026-05-15T10:00:00Z'),
      },
    ],
    commentCount: 1,
  }
}

// ---------------------------------------------------------------------------
// CommentImageAttachButton
// ---------------------------------------------------------------------------

describe('CommentImageAttachButton', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders the attach button when no image is attached', () => {
    const onChange = vi.fn()
    render(
      <CommentImageAttachButton
        onUploadImage={async () => ({ url: 'https://x.vercel-storage.com/img.png', width: 100, height: 80 })}
        value={null}
        onChange={onChange}
      />,
    )
    expect(screen.getByTestId('comment-image-attach')).toBeInTheDocument()
    expect(screen.queryByTestId('comment-image-preview')).not.toBeInTheDocument()
  })

  it('shows a thumbnail and remove button when an image is attached', () => {
    const onChange = vi.fn()
    render(
      <CommentImageAttachButton
        onUploadImage={async () => ({ url: 'https://x.vercel-storage.com/img.png', width: 100, height: 80 })}
        value={{ url: 'https://x.vercel-storage.com/img.png', width: 100, height: 80 }}
        onChange={onChange}
      />,
    )
    expect(screen.getByTestId('comment-image-preview')).toBeInTheDocument()
    expect(screen.getByTestId('comment-image-remove')).toBeInTheDocument()
    expect(screen.queryByTestId('comment-image-attach')).not.toBeInTheDocument()
  })

  it('calls onChange(null) when the remove button is clicked', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <CommentImageAttachButton
        onUploadImage={async () => ({ url: 'https://x.vercel-storage.com/img.png', width: 100, height: 80 })}
        value={{ url: 'https://x.vercel-storage.com/img.png', width: 100, height: 80 }}
        onChange={onChange}
      />,
    )
    await user.click(screen.getByTestId('comment-image-remove'))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('shows an error for a file exceeding 5 MB and does NOT call onUploadImage', async () => {
    const onUploadImage = vi.fn()
    const onChange = vi.fn()
    render(
      <CommentImageAttachButton
        onUploadImage={onUploadImage}
        value={null}
        onChange={onChange}
      />,
    )

    const input = screen.getByTestId('comment-image-file-input') as HTMLInputElement
    const bigFile = makeFile('big.png', 6 * 1024 * 1024)
    await act(async () => {
      fireEvent.change(input, { target: { files: [bigFile] } })
    })

    expect(onUploadImage).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByTestId('comment-image-error')).toBeInTheDocument()
  })

  it('calls onUploadImage and then onChange with the result for a valid file', async () => {
    const result = { url: 'https://x.vercel-storage.com/img.png', width: 200, height: 150 }
    const onUploadImage = vi.fn().mockResolvedValue(result)
    const onChange = vi.fn()
    render(
      <CommentImageAttachButton
        onUploadImage={onUploadImage}
        value={null}
        onChange={onChange}
      />,
    )

    const input = screen.getByTestId('comment-image-file-input') as HTMLInputElement
    const file = makeFile('screen.png', 1000)
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })

    expect(onUploadImage).toHaveBeenCalledWith(file)
    expect(onChange).toHaveBeenCalledWith(result)
  })
})

// ---------------------------------------------------------------------------
// PinDraftComposer with onUploadImage
// ---------------------------------------------------------------------------

describe('PinDraftComposer + attach-image', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders the attach button when onUploadImage is provided', () => {
    render(
      <PinDraftComposer
        anchor={{ x: 100, y: 100 }}
        onSubmit={async () => {}}
        onCancel={() => {}}
        onUploadImage={async () => ({ url: 'https://x.vercel-storage.com/img.png', width: 10, height: 10 })}
      />,
    )
    expect(screen.getByTestId('comment-image-attach')).toBeInTheDocument()
  })

  it('does NOT render the attach button without onUploadImage', () => {
    render(
      <PinDraftComposer
        anchor={{ x: 100, y: 100 }}
        onSubmit={async () => {}}
        onCancel={() => {}}
      />,
    )
    expect(screen.queryByTestId('comment-image-attach')).not.toBeInTheDocument()
  })

  it('after a stubbed upload, submit calls onSubmit with body + image', async () => {
    const uploadResult = { url: 'https://x.vercel-storage.com/img.png', width: 200, height: 150 }
    const onUploadImage = vi.fn().mockResolvedValue(uploadResult)
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    render(
      <PinDraftComposer
        anchor={{ x: 100, y: 100 }}
        onSubmit={onSubmit}
        onCancel={() => {}}
        onUploadImage={onUploadImage}
      />,
    )

    // Upload a file via the hidden input.
    const input = screen.getByTestId('comment-image-file-input') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } })
    })

    // Type a body and submit.
    await user.type(screen.getByTestId('pin-draft-composer-input'), 'Check this out')
    await user.click(screen.getByTestId('pin-draft-composer-submit'))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const [body, image] = onSubmit.mock.calls[0]
    expect(body).toBe('Check this out')
    expect(image).toEqual(uploadResult)
  })

  it('allows image-only submit (empty body) when an image is attached', async () => {
    const uploadResult = { url: 'https://x.vercel-storage.com/img.png', width: 200, height: 150 }
    const onUploadImage = vi.fn().mockResolvedValue(uploadResult)
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    render(
      <PinDraftComposer
        anchor={{ x: 100, y: 100 }}
        onSubmit={onSubmit}
        onCancel={() => {}}
        onUploadImage={onUploadImage}
      />,
    )

    // Upload only — no text typed.
    const input = screen.getByTestId('comment-image-file-input') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } })
    })

    // Submit button should now be enabled.
    const submitBtn = screen.getByTestId('pin-draft-composer-submit')
    expect(submitBtn).not.toBeDisabled()

    await user.click(submitBtn)

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const [body, image] = onSubmit.mock.calls[0]
    expect(body).toBe('')
    expect(image).toEqual(uploadResult)
  })
})

// ---------------------------------------------------------------------------
// PinPopover with onUploadImage
// ---------------------------------------------------------------------------

describe('PinPopover + attach-image', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders the attach button when onUploadImage is provided', () => {
    render(
      <PinPopover
        thread={makeThread()}
        anchor={{ x: 100, y: 100 }}
        mode="internal"
        onComment={async () => {}}
        onUploadImage={async () => ({ url: 'https://x.vercel-storage.com/img.png', width: 10, height: 10 })}
      />,
    )
    expect(screen.getByTestId('comment-image-attach')).toBeInTheDocument()
  })

  it('does NOT render the attach button without onUploadImage', () => {
    render(
      <PinPopover
        thread={makeThread()}
        anchor={{ x: 100, y: 100 }}
        mode="internal"
        onComment={async () => {}}
      />,
    )
    expect(screen.queryByTestId('comment-image-attach')).not.toBeInTheDocument()
  })

  it('after a stubbed upload, submit calls onComment with body + image', async () => {
    const uploadResult = { url: 'https://x.vercel-storage.com/img.png', width: 200, height: 150 }
    const onUploadImage = vi.fn().mockResolvedValue(uploadResult)
    const onComment = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(
      <PinPopover
        thread={makeThread()}
        anchor={{ x: 100, y: 100 }}
        mode="internal"
        onComment={onComment}
        onUploadImage={onUploadImage}
      />,
    )

    // Upload an image via the hidden file input.
    const input = screen.getByTestId('comment-image-file-input') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } })
    })

    // Add text and submit.
    await user.type(screen.getByTestId('pin-popover-input'), 'See attachment')
    await user.click(screen.getByTestId('pin-popover-submit'))

    expect(onComment).toHaveBeenCalledTimes(1)
    const [body, image] = onComment.mock.calls[0]
    expect(body).toBe('See attachment')
    expect(image).toEqual(uploadResult)
  })

  it('allows image-only comment (empty body) when an image is attached', async () => {
    const uploadResult = { url: 'https://x.vercel-storage.com/img.png', width: 200, height: 150 }
    const onUploadImage = vi.fn().mockResolvedValue(uploadResult)
    const onComment = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(
      <PinPopover
        thread={makeThread()}
        anchor={{ x: 100, y: 100 }}
        mode="internal"
        onComment={onComment}
        onUploadImage={onUploadImage}
      />,
    )

    // Upload only — no text typed.
    const input = screen.getByTestId('comment-image-file-input') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } })
    })

    const submitBtn = screen.getByTestId('pin-popover-submit')
    expect(submitBtn).not.toBeDisabled()

    await user.click(submitBtn)

    expect(onComment).toHaveBeenCalledTimes(1)
    const [body, image] = onComment.mock.calls[0]
    expect(body).toBe('')
    expect(image).toEqual(uploadResult)
  })
})
