import { describe, it, expect, vi } from 'vitest'
import {
  runNotificationEmailSweep,
  type SweepDeps,
} from '@/server/services/notificationEmailSweep'
import type { DueMentionRow } from '@/server/repositories/activityEvents'

const NOW = new Date('2026-09-02T15:00:00Z')

function dueRow(
  mentionId: string,
  recipientId: string,
  clientName = 'Alpha Co',
  clientId = 'c1',
): DueMentionRow {
  return {
    mentionId,
    readAt: null,
    recipient: {
      id: recipientId,
      name: `User ${recipientId}`,
      email: `${recipientId}@example.com`,
    },
    client: { id: clientId, name: clientName },
    postBatchId: null,
    event: {
      id: `e_${mentionId}`,
      clientId,
      runId: null,
      postId: null,
      kind: 'post_comment_added',
      createdAt: NOW,
      actor: { id: 'u_actor', name: 'Mollie', avatarUrl: null },
      payload: {},
    },
  } as unknown as DueMentionRow
}

function makeDeps(
  rows: DueMentionRow[],
  over: Partial<SweepDeps> = {},
): SweepDeps & { sent: string[] } {
  const sent: string[] = []
  const deps: SweepDeps = {
    listDue: vi.fn().mockResolvedValue(rows),
    claim: vi.fn(async (ids: string[]) => ids),
    release: vi.fn(async () => {}),
    send: vi.fn(async (input) => {
      sent.push(input.recipientEmail)
    }),
    baseUrl: 'https://relay.test',
    ...over,
  }
  return Object.assign(deps, { sent })
}

describe('runNotificationEmailSweep', () => {
  it('sends nothing when nothing is due', async () => {
    const deps = makeDeps([])

    const result = await runNotificationEmailSweep({ now: NOW }, deps)

    expect(result).toEqual({
      recipients: 0,
      emailsSent: 0,
      mentionsEmailed: 0,
      failures: 0,
    })
    expect(deps.send).not.toHaveBeenCalled()
    expect(deps.claim).not.toHaveBeenCalled()
  })

  it('sends one email per recipient, not per mention', async () => {
    const deps = makeDeps([
      dueRow('m1', 'u1'),
      dueRow('m2', 'u1'),
      dueRow('m3', 'u2'),
    ])

    const result = await runNotificationEmailSweep({ now: NOW }, deps)

    expect(result.recipients).toBe(2)
    expect(result.emailsSent).toBe(2)
    expect(result.mentionsEmailed).toBe(3)
    expect(deps.sent.sort()).toEqual(['u1@example.com', 'u2@example.com'])
  })

  it('claims before sending, so a concurrent sweep cannot double send', async () => {
    const order: string[] = []
    const deps = makeDeps([dueRow('m1', 'u1')], {
      claim: vi.fn(async (ids: string[]) => {
        order.push('claim')
        return ids
      }),
      send: vi.fn(async () => {
        order.push('send')
      }),
    })

    await runNotificationEmailSweep({ now: NOW }, deps)

    expect(order).toEqual(['claim', 'send'])
  })

  it('skips a recipient whose mentions were all claimed by another sweep', async () => {
    const deps = makeDeps([dueRow('m1', 'u1')], {
      claim: vi.fn(async () => []),
    })

    const result = await runNotificationEmailSweep({ now: NOW }, deps)

    expect(deps.send).not.toHaveBeenCalled()
    expect(result.emailsSent).toBe(0)
  })

  it('releases the claim when the send fails, so a later tap retries', async () => {
    const deps = makeDeps([dueRow('m1', 'u1')], {
      send: vi.fn().mockRejectedValue(new Error('Resend down')),
    })

    const result = await runNotificationEmailSweep({ now: NOW }, deps)

    expect(deps.release).toHaveBeenCalledWith(['m1'])
    expect(result.failures).toBe(1)
    expect(result.emailsSent).toBe(0)
  })

  it('one recipient failing still sends the others', async () => {
    const deps = makeDeps([dueRow('m1', 'u1'), dueRow('m2', 'u2')], {
      send: vi.fn(async (input) => {
        if (input.recipientEmail === 'u1@example.com') throw new Error('bad address')
      }),
    })

    const result = await runNotificationEmailSweep({ now: NOW }, deps)

    expect(result.emailsSent).toBe(1)
    expect(result.failures).toBe(1)
    expect(deps.release).toHaveBeenCalledWith(['m1'])
  })

  it('caps how many recipients one tap handles', async () => {
    const deps = makeDeps([
      dueRow('m1', 'u1'),
      dueRow('m2', 'u2'),
      dueRow('m3', 'u3'),
    ])

    const result = await runNotificationEmailSweep(
      { now: NOW, maxRecipients: 2 },
      deps,
    )

    expect(result.recipients).toBe(2)
    expect(result.emailsSent).toBe(2)
  })

  it('groups a recipients items by client in the sent content', async () => {
    const deps = makeDeps([
      dueRow('m1', 'u1', 'Alpha Co', 'c1'),
      dueRow('m2', 'u1', 'Beta Co', 'c2'),
    ])

    await runNotificationEmailSweep({ now: NOW }, deps)

    const input = vi.mocked(deps.send).mock.calls[0][0]
    expect(input.content.clientCount).toBe(2)
    expect(input.content.totalCount).toBe(2)
    expect(input.content.groups.map((g) => g.clientName)).toEqual([
      'Alpha Co',
      'Beta Co',
    ])
  })
})
