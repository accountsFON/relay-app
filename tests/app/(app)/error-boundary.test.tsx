import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import * as Sentry from '@sentry/nextjs'
import AppError from '@/app/(app)/error'

describe('(app) error boundary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reports the error to Sentry and shows the friendly fallback', () => {
    const error = Object.assign(new Error('boom'), { digest: 'abc123' })
    render(<AppError error={error} reset={() => {}} />)

    expect(Sentry.captureException).toHaveBeenCalledWith(error)
    expect(screen.getByText(/Something's off/i)).toBeInTheDocument()
    // The digest (server correlation id) stays visible for bug reports.
    expect(screen.getByText(/abc123/)).toBeInTheDocument()
  })
})
