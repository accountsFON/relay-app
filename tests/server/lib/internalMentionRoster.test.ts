import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/client', () => ({
  db: {
    client: { findUnique: vi.fn() },
    user: { findMany: vi.fn() },
  },
}))

import { db } from '@/db/client'
import { internalMentionRosterForClient } from '@/server/lib/internalMentionRoster'

beforeEach(() => vi.clearAllMocks())

describe('internalMentionRosterForClient', () => {
  it('returns AM + designer + admins as { id, name, handle }, deduped, internal only', async () => {
    vi.mocked(db.client.findUnique).mockResolvedValue({
      assignedAmId: 'am1',
      assignedDesignerId: 'des1',
      organizationId: 'org1',
    } as never)
    // user.findMany returns the two assignees + every admin in the org.
    vi.mocked(db.user.findMany).mockResolvedValue([
      { id: 'am1', name: 'Amy Manager', role: 'account_manager' },
      { id: 'des1', name: 'Dan Designer', role: 'designer' },
      { id: 'adm1', name: 'Alice Admin', role: 'admin' },
      { id: 'adm2', name: 'Bob Admin', role: 'admin' },
    ] as never)

    const roster = await internalMentionRosterForClient('c1')
    const ids = roster.map((r) => r.id)
    expect(ids).toContain('am1')
    expect(ids).toContain('des1')
    expect(ids).toContain('adm1')
    expect(ids).toContain('adm2')
    // Each entry carries name + derived handle.
    const amy = roster.find((r) => r.id === 'am1')
    expect(amy).toEqual({ id: 'am1', name: 'Amy Manager', handle: 'amy.manager' })
  })

  it('dedupes a user who is both an admin and the assigned AM', async () => {
    vi.mocked(db.client.findUnique).mockResolvedValue({
      assignedAmId: 'u1',
      assignedDesignerId: null,
      organizationId: 'org1',
    } as never)
    vi.mocked(db.user.findMany).mockResolvedValue([
      { id: 'u1', name: 'Casey Both', role: 'admin' },
    ] as never)

    const roster = await internalMentionRosterForClient('c1')
    expect(roster.filter((r) => r.id === 'u1')).toHaveLength(1)
  })

  it('excludes client-role users', async () => {
    vi.mocked(db.client.findUnique).mockResolvedValue({
      assignedAmId: 'am1',
      assignedDesignerId: null,
      organizationId: 'org1',
    } as never)
    vi.mocked(db.user.findMany).mockResolvedValue([
      { id: 'am1', name: 'Amy Manager', role: 'account_manager' },
      { id: 'cli1', name: 'Client Person', role: 'client' },
    ] as never)

    const roster = await internalMentionRosterForClient('c1')
    expect(roster.map((r) => r.id)).not.toContain('cli1')
    expect(roster.map((r) => r.id)).toContain('am1')
  })

  it('returns empty when the client is missing', async () => {
    vi.mocked(db.client.findUnique).mockResolvedValue(null as never)
    const roster = await internalMentionRosterForClient('nope')
    expect(roster).toEqual([])
    expect(db.user.findMany).not.toHaveBeenCalled()
  })
})
