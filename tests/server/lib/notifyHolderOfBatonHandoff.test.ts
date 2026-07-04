/**
 * Unit tests for src/server/lib/notifyHolderOfBatonHandoff.ts.
 *
 * Mocks the DB + the email service at the module boundary. Verifies the
 * happy path maps the right fields and every skip rule (no holder, self,
 * client-role recipient, no email) plus error swallowing.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { RelayStep } from '@prisma/client'

vi.mock('@/db/client', () => ({
  db: {
    user: { findUnique: vi.fn() },
    batch: { findUnique: vi.fn() },
  },
}))

vi.mock('@/server/services/sendRelayHandoffEmail', () => ({
  sendRelayHandoffEmail: vi.fn(),
}))

import { db } from '@/db/client'
import { sendRelayHandoffEmail } from '@/server/services/sendRelayHandoffEmail'
import { notifyHolderOfBatonHandoff } from '@/server/lib/notifyHolderOfBatonHandoff'

const RECIPIENT = { email: 'payton@example.com', name: 'Payton Monzon', role: 'designer' }
const ACTOR = { email: 'julio@example.com', name: 'Julio Aleman' }
const BATCH = { label: 'May 2026', client: { name: 'My DUI Guy' } }

// The helper fetches via Promise.all in a fixed order: recipient user,
// then actor user, then batch. Queue the two user results accordingly.
function wireDb(recipient: unknown = RECIPIENT) {
  vi.mocked(db.user.findUnique)
    .mockResolvedValueOnce(recipient as never)
    .mockResolvedValueOnce(ACTOR as never)
  vi.mocked(db.batch.findUnique).mockResolvedValue(BATCH as never)
}

const base = {
  batchId: 'b1',
  clientId: 'c1',
  newHolderId: 'u_recipient',
  actorId: 'u_actor',
  toStep: RelayStep.in_design,
  direction: 'forward' as const,
}

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) also drains the mockResolvedValueOnce
  // queue, so skip tests that return before touching the DB don't leak
  // queued user rows into the next test.
  vi.resetAllMocks()
})

describe('notifyHolderOfBatonHandoff', () => {
  it('emails the new holder with mapped fields on the happy path', async () => {
    wireDb()
    await notifyHolderOfBatonHandoff(base)

    expect(sendRelayHandoffEmail).toHaveBeenCalledTimes(1)
    expect(sendRelayHandoffEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientName: 'Payton Monzon',
        recipientEmail: 'payton@example.com',
        actorName: 'Julio Aleman',
        actorEmail: 'julio@example.com',
        clientName: 'My DUI Guy',
        batchLabel: 'May 2026',
        direction: 'forward',
        relayUrl: expect.stringContaining('/clients/c1/batches/b1'),
      }),
    )
  })

  it('passes the reason through on a send-back', async () => {
    wireDb()
    await notifyHolderOfBatonHandoff({ ...base, direction: 'back', reason: 'Redo post 3' })
    expect(sendRelayHandoffEmail).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'back', reason: 'Redo post 3' }),
    )
  })

  it('skips when there is no new holder', async () => {
    wireDb()
    await notifyHolderOfBatonHandoff({ ...base, newHolderId: null })
    expect(sendRelayHandoffEmail).not.toHaveBeenCalled()
  })

  it('skips when the new holder is the actor (no self-email)', async () => {
    wireDb()
    await notifyHolderOfBatonHandoff({ ...base, newHolderId: 'u_actor' })
    expect(sendRelayHandoffEmail).not.toHaveBeenCalled()
  })

  it('skips a client-role recipient (they get the magic-link invite instead)', async () => {
    wireDb({ ...RECIPIENT, role: 'client' })
    await notifyHolderOfBatonHandoff(base)
    expect(sendRelayHandoffEmail).not.toHaveBeenCalled()
  })

  it('skips when the recipient has no email on file', async () => {
    wireDb({ ...RECIPIENT, email: '' })
    await notifyHolderOfBatonHandoff(base)
    expect(sendRelayHandoffEmail).not.toHaveBeenCalled()
  })

  it('swallows email-send errors (never throws)', async () => {
    wireDb()
    vi.mocked(sendRelayHandoffEmail).mockRejectedValueOnce(new Error('resend down'))
    await expect(notifyHolderOfBatonHandoff(base)).resolves.toBeUndefined()
  })
})
