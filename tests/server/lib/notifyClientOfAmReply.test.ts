import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/client', () => ({
  db: {
    postThread: { findUnique: vi.fn() },
    magicLink: { findUnique: vi.fn(), updateMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/resend', () => ({ sendEmail: vi.fn().mockResolvedValue({ id: 'e1' }) }))
vi.mock('@/lib/magic-link', () => ({ signToken: vi.fn().mockReturnValue('tok123') }))

import { db } from '@/db/client'
import { sendEmail } from '@/lib/resend'
import { notifyClientOfAmReply } from '@/server/lib/notifyClientOfAmReply'

const thread = { id: 't1', reviewerToken: 'HASH', post: { batch: { client: { name: 'Acme Co' } } } }
const link = {
  id: 'ml1',
  expiresAt: new Date('2030-01-01'),
  revokedAt: null as Date | null,
  batch: { deletedAt: null as Date | null },
  defaultReviewerEmail: 'dana@acme.com',
  defaultReviewerName: 'Dana Lee',
}
const am = { name: 'Morgan AM', email: 'morgan@fon.com' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.postThread.findUnique).mockResolvedValue(thread as never)
  vi.mocked(db.magicLink.findUnique).mockResolvedValue(link as never)
  vi.mocked(db.magicLink.updateMany).mockResolvedValue({ count: 1 } as never)
  vi.mocked(db.user.findUnique).mockResolvedValue(am as never)
})

describe('notifyClientOfAmReply', () => {
  it('sends to the reviewer with the deep link and AM replyTo when the cooldown is claimed', async () => {
    await notifyClientOfAmReply({ threadId: 't1', amUserId: 'u_am' })
    expect(db.magicLink.updateMany).toHaveBeenCalled()
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'dana@acme.com', replyTo: 'morgan@fon.com' }))
  })
  it('no-ops when the thread has no reviewerToken (AM-only thread)', async () => {
    vi.mocked(db.postThread.findUnique).mockResolvedValue({ ...thread, reviewerToken: null } as never)
    await notifyClientOfAmReply({ threadId: 't1', amUserId: 'u_am' })
    expect(sendEmail).not.toHaveBeenCalled()
  })
  it('does not send when the cooldown claim returns count 0 (coalesced)', async () => {
    vi.mocked(db.magicLink.updateMany).mockResolvedValue({ count: 0 } as never)
    await notifyClientOfAmReply({ threadId: 't1', amUserId: 'u_am' })
    expect(sendEmail).not.toHaveBeenCalled()
  })
  it('skips the send when the reviewer email is empty but still claimed', async () => {
    vi.mocked(db.magicLink.findUnique).mockResolvedValue({ ...link, defaultReviewerEmail: '' } as never)
    await notifyClientOfAmReply({ threadId: 't1', amUserId: 'u_am' })
    expect(sendEmail).not.toHaveBeenCalled()
  })
  it('never throws when sendEmail fails', async () => {
    vi.mocked(sendEmail).mockRejectedValue(new Error('resend down'))
    await expect(notifyClientOfAmReply({ threadId: 't1', amUserId: 'u_am' })).resolves.toBeUndefined()
  })

  // The email re-mints a token and links to /review/[token]; middleware 404s an
  // expired token and 410s a revoked link or archived batch. Filter those out
  // before emailing so the client never gets a dead link to an error page. The
  // cooldown must NOT be consumed for a dead link.
  it('does not email (or consume the cooldown) when the link is expired', async () => {
    vi.mocked(db.magicLink.findUnique).mockResolvedValue({ ...link, expiresAt: new Date('2000-01-01') } as never)
    await notifyClientOfAmReply({ threadId: 't1', amUserId: 'u_am' })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(db.magicLink.updateMany).not.toHaveBeenCalled()
  })
  it('does not email (or consume the cooldown) when the link is revoked', async () => {
    vi.mocked(db.magicLink.findUnique).mockResolvedValue({ ...link, revokedAt: new Date('2026-01-01') } as never)
    await notifyClientOfAmReply({ threadId: 't1', amUserId: 'u_am' })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(db.magicLink.updateMany).not.toHaveBeenCalled()
  })
  it('does not email (or consume the cooldown) when the batch is archived', async () => {
    vi.mocked(db.magicLink.findUnique).mockResolvedValue({ ...link, batch: { deletedAt: new Date('2026-01-01') } } as never)
    await notifyClientOfAmReply({ threadId: 't1', amUserId: 'u_am' })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(db.magicLink.updateMany).not.toHaveBeenCalled()
  })

  // Regression: NEXT_PUBLIC_APP_URL is NOT set in prod, so the old
  // `NEXT_PUBLIC_APP_URL ?? localhost` built a localhost link the client could
  // not open. Fall back to the Vercel prod alias like every other URL builder.
  it('builds the review URL from the Vercel prod alias when NEXT_PUBLIC_APP_URL is unset', async () => {
    const prev = {
      app: process.env.NEXT_PUBLIC_APP_URL,
      prod: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    }
    delete process.env.NEXT_PUBLIC_APP_URL
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'relay-app-xi.vercel.app'
    try {
      await notifyClientOfAmReply({ threadId: 't1', amUserId: 'u_am' })
      const arg = vi.mocked(sendEmail).mock.calls[0]![0] as { react: { props: { reviewUrl: string } } }
      expect(arg.react.props.reviewUrl).toBe('https://relay-app-xi.vercel.app/review/tok123')
    } finally {
      if (prev.app === undefined) delete process.env.NEXT_PUBLIC_APP_URL
      else process.env.NEXT_PUBLIC_APP_URL = prev.app
      if (prev.prod === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL
      else process.env.VERCEL_PROJECT_PRODUCTION_URL = prev.prod
    }
  })
})
