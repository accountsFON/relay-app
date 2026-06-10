import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const requireOrgContext = vi.fn()
const redirect = vi.fn((_u: string): never => { throw new Error('REDIRECT') })
const listArchived = vi.fn()
vi.mock('@/server/middleware/auth', () => ({ requireOrgContext: () => requireOrgContext() }))
vi.mock('next/navigation', () => ({ redirect: (u: string) => redirect(u) }))
vi.mock('@/server/repositories/batches', () => ({ listArchivedBatchesForViewer: (c: unknown) => listArchived(c) }))

import ArchivePage from '@/app/(app)/archive/page'

beforeEach(() => {
  vi.clearAllMocks()
  requireOrgContext.mockResolvedValue({ role: 'admin', platformOwner: false, organizationDbId: 'org1', userDbId: 'u1' })
  listArchived.mockResolvedValue([
    { id: 'b1', clientId: 'c1', clientName: 'Brothers Marine', label: 'June 2026', createdAt: new Date('2026-06-01T10:00:00Z'), deletedAt: new Date('2026-06-02T15:14:00Z') },
  ])
})

describe('ArchivePage', () => {
  it('renders archived batches with client + label + created/archived dates and a link to the batch', async () => {
    render(await ArchivePage())
    expect(screen.getByText('Brothers Marine')).toBeInTheDocument()
    expect(screen.getByText('June 2026')).toBeInTheDocument()
    expect(screen.getByText(/Created/)).toBeInTheDocument()
    expect(screen.getByText(/Archived/)).toBeInTheDocument()
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/clients/c1/batches/b1')
  })

  it('redirects a designer away', async () => {
    requireOrgContext.mockResolvedValue({ role: 'designer', platformOwner: false, organizationDbId: 'org1', userDbId: 'u1' })
    await expect(ArchivePage()).rejects.toThrow('REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/dashboard')
  })
})
