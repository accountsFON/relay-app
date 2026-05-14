import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AppError from '@/app/(app)/error'

describe('AppError', () => {
  it('renders the friendly fallback message and both action buttons', () => {
    const reset = vi.fn()
    const error = Object.assign(new Error('boom'), { digest: 'abc123' })

    render(<AppError error={error} reset={reset} />)

    expect(screen.getByText(/something's off/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /dashboard/i })).toBeTruthy()
  })

  it('surfaces the error digest for support correlation', () => {
    const reset = vi.fn()
    const error = Object.assign(new Error('boom'), { digest: 'abc123' })

    render(<AppError error={error} reset={reset} />)

    expect(screen.getByText(/ref: abc123/i)).toBeTruthy()
  })

  it('hides the digest line when no digest is present', () => {
    const reset = vi.fn()
    const error = new Error('boom') as Error & { digest?: string }

    render(<AppError error={error} reset={reset} />)

    expect(screen.queryByText(/^ref:/i)).toBeNull()
  })

  it('calls reset when the Try again button is clicked', () => {
    const reset = vi.fn()
    const error = new Error('boom') as Error & { digest?: string }

    render(<AppError error={error} reset={reset} />)
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))

    expect(reset).toHaveBeenCalledTimes(1)
  })
})
