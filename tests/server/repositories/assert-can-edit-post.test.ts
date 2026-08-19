import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/client', () => ({
  db: {
    membership: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    roleDefault: { findMany: vi.fn() },
    post: { findUnique: vi.fn(), update: vi.fn() },
    client: { findUnique: vi.fn() },
  },
}))

import { db } from '@/db/client'
import { updatePost } from '@/server/repositories/posts'

const ORG = 'org-1'
const ACTOR = 'user-1'

function primeMembership(
  role: string,
  permissionOverrides: Record<string, boolean> | null = null,
) {
  vi.mocked(db.membership.findUnique).mockResolvedValue({
    userId: ACTOR,
    organizationId: ORG,
    role,
    permissionOverrides,
  } as never)
}

function primeRoleDefaults(rows: { role: string; permissionKey: string; allow: boolean }[]) {
  vi.mocked(db.roleDefault.findMany).mockResolvedValue(rows as never)
}

function primeUser(platformOwner: boolean) {
  vi.mocked(db.user.findUnique).mockResolvedValue({ platformOwner } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  primeRoleDefaults([])
  primeUser(false)
  vi.mocked(db.post.findUnique).mockResolvedValue({
    id: 'p1',
    clientId: 'c1',
    caption: 'old',
    hashtags: [],
  } as never)
  vi.mocked(db.client.findUnique).mockResolvedValue({ organizationId: ORG } as never)
  vi.mocked(db.post.update).mockResolvedValue({ id: 'p1' } as never)
})

// assertCanEditPost is module-private, so it is exercised through updatePost,
// the write path AMs actually hit when saving a caption.
describe('assertCanEditPost, reached via updatePost', () => {
  it('allows an account manager, who holds post.edit by system default', async () => {
    primeMembership('account_manager')
    await expect(
      updatePost('p1', { caption: 'new' }, ACTOR),
    ).resolves.not.toThrow()
  })

  it('denies a user whose personal override switches post.edit off', async () => {
    // This is the exact production state that broke caption saving for AMs:
    // client.edit still true so the UI offered the editor, post.edit false so
    // the write was rejected at the last moment.
    primeMembership('account_manager', { 'post.edit': false })
    await expect(updatePost('p1', { caption: 'new' }, ACTOR)).rejects.toThrow(
      /does not have post.edit/i,
    )
  })

  it('honours an ORG ROLE DEFAULT that grants post.edit to a role without it', async () => {
    // Designers lack post.edit by system default. An org that grants it via the
    // role-defaults editor must be respected here, exactly as every other gate
    // respects it. Previously ignored, so the grant silently did nothing.
    primeMembership('designer')
    primeRoleDefaults([{ role: 'designer', permissionKey: 'post.edit', allow: true }])
    await expect(
      updatePost('p1', { caption: 'new' }, ACTOR),
    ).resolves.not.toThrow()
  })

  it('honours an ORG ROLE DEFAULT that revokes post.edit from a role that has it', async () => {
    primeMembership('account_manager')
    primeRoleDefaults([
      { role: 'account_manager', permissionKey: 'post.edit', allow: false },
    ])
    await expect(updatePost('p1', { caption: 'new' }, ACTOR)).rejects.toThrow(
      /does not have post.edit/i,
    )
  })

  it('lets a personal override beat an org role default, matching can() precedence', async () => {
    primeMembership('account_manager', { 'post.edit': true })
    primeRoleDefaults([
      { role: 'account_manager', permissionKey: 'post.edit', allow: false },
    ])
    await expect(
      updatePost('p1', { caption: 'new' }, ACTOR),
    ).resolves.not.toThrow()
  })

  it('never denies a platform owner, whatever their role says', async () => {
    primeMembership('designer')
    primeUser(true)
    await expect(
      updatePost('p1', { caption: 'new' }, ACTOR),
    ).resolves.not.toThrow()
  })

  it('still denies a user with no membership in the org', async () => {
    vi.mocked(db.membership.findUnique).mockResolvedValue(null as never)
    await expect(updatePost('p1', { caption: 'new' }, ACTOR)).rejects.toThrow(
      /no membership/i,
    )
  })

  it('scopes the role-default lookup to the post’s organization', async () => {
    primeMembership('account_manager')
    await updatePost('p1', { caption: 'new' }, ACTOR)
    expect(db.roleDefault.findMany).toHaveBeenCalledWith({
      where: { organizationId: ORG },
    })
  })
})
