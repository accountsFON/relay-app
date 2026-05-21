import { describe, it, expect } from 'vitest'
import { renderSummary, resolveHref } from '@/lib/notification-copy'
import type { MentionInboxRow } from '@/components/activity/types'

function row(payload: Record<string, unknown>, overrides: Partial<MentionInboxRow> = {}): MentionInboxRow {
  return {
    mentionId: 'm1',
    readAt: null,
    client: { id: 'c1', name: 'Cedar Creek', ...(overrides.client ?? {}) },
    event: {
      id: 'e1',
      createdAt: new Date('2026-05-21T12:00:00Z'),
      kind: payload.kind as MentionInboxRow['event']['kind'],
      payload: payload as MentionInboxRow['event']['payload'],
      actor: { id: 'u1', name: 'Mollie', avatarUrl: null },
      runId: null,
      ...(overrides.event ?? {}),
    },
  } as MentionInboxRow
}

describe('renderSummary, existing kinds', () => {
  it('comment renders actor and trimmed body', () => {
    expect(renderSummary(row({ kind: 'comment', body: 'Looks great team' }))).toBe(
      'Cedar Creek · Mollie: Looks great team',
    )
  })

  it('comment truncates bodies over 120 chars', () => {
    const long = 'a'.repeat(200)
    const out = renderSummary(row({ kind: 'comment', body: long }))
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBeLessThan(150)
  })

  it('batch_passed includes step label when toStep present', () => {
    expect(
      renderSummary(row({ kind: 'batch_passed', batchLabel: 'May batch', toStep: 'copy_step' })),
    ).toMatch(/Mollie passed "May batch" to you/)
  })

  it('batch_sent_back uses default relay label when batchLabel missing', () => {
    expect(renderSummary(row({ kind: 'batch_sent_back' }))).toBe(
      'Cedar Creek · Mollie sent a relay back to you for changes.',
    )
  })

  it('batch_revision_dispatched names item type and trimmed description', () => {
    const out = renderSummary(
      row({ kind: 'batch_revision_dispatched', itemType: 'caption', itemDescription: 'Tighten hook' }),
    )
    expect(out).toBe('Cedar Creek · Mollie asked you to revise caption: "Tighten hook"')
  })

  it('batch_revision_completed renders without item details', () => {
    expect(renderSummary(row({ kind: 'batch_revision_completed' }))).toBe(
      'Cedar Creek · Mollie marked the revision complete.',
    )
  })

  it('batch_step_advanced names target step', () => {
    expect(
      renderSummary(row({ kind: 'batch_step_advanced', batchLabel: 'May batch', toSubState: 'final_qa_schedule' })),
    ).toMatch(/Mollie moved "May batch"/)
  })

  it('run_completed includes post count when present', () => {
    expect(renderSummary(row({ kind: 'run_completed', postCount: 30 }))).toBe(
      'Cedar Creek · Generation complete: 30 posts ready for your review.',
    )
  })

  it('run_completed falls back without post count', () => {
    expect(renderSummary(row({ kind: 'run_completed' }))).toBe(
      'Cedar Creek · Generation complete: posts ready for your review.',
    )
  })

  it('client_am_assigned names client', () => {
    expect(renderSummary(row({ kind: 'client_am_assigned' }))).toBe(
      'Cedar Creek · Mollie assigned you as the Account Manager for Cedar Creek.',
    )
  })

  it('client_designer_assigned names client', () => {
    expect(renderSummary(row({ kind: 'client_designer_assigned' }))).toBe(
      'Cedar Creek · Mollie assigned you as the Designer for Cedar Creek.',
    )
  })

  it('member_role_changed renders new role', () => {
    expect(renderSummary(row({ kind: 'member_role_changed', toRole: 'admin' }))).toBe(
      'Cedar Creek · Mollie changed your role to admin.',
    )
  })

  it('run_failed names target month', () => {
    expect(renderSummary(row({ kind: 'run_failed', targetMonth: 'June 2026' }))).toBe(
      'Cedar Creek · June 2026 content generation failed for Cedar Creek.',
    )
  })
})

describe('renderSummary, new kinds (parity sweep)', () => {
  it('review_session_started names round', () => {
    expect(
      renderSummary(row({ kind: 'review_session_started', round: 1 })),
    ).toBe('Cedar Creek · Client review round 1 started.')
  })

  it('review_session_submitted includes summary chips', () => {
    expect(
      renderSummary(row({
        kind: 'review_session_submitted',
        round: 1,
        summary: { approved: 3, changesRequested: 1, captionEdited: 1 },
      })),
    ).toBe('Cedar Creek · Client review submitted (3 approved, 1 changes, 1 edits).')
  })

  it('review_caption_edit_accepted names short post ref', () => {
    expect(
      renderSummary(row({ kind: 'review_caption_edit_accepted', postId: 'abc123def456' })),
    ).toBe('Cedar Creek · Mollie accepted the client caption edit on post abc123.')
  })

  it('review_item_addressed names short post ref', () => {
    expect(
      renderSummary(row({ kind: 'review_item_addressed', postId: 'abc123def456' })),
    ).toBe('Cedar Creek · Mollie marked feedback addressed on post abc123.')
  })

  it('review_round_started includes round number', () => {
    expect(
      renderSummary(row({ kind: 'review_round_started', round: 2 })),
    ).toBe('Cedar Creek · Round 2 review opened.')
  })

  it('post_thread_opened names short post ref', () => {
    expect(
      renderSummary(row({ kind: 'post_thread_opened', postId: 'abc123def456' })),
    ).toBe('Cedar Creek · Mollie opened a thread on post abc123.')
  })

  it('post_thread_resolved includes reason when present', () => {
    expect(
      renderSummary(row({ kind: 'post_thread_resolved', postId: 'abc123def456', resolvedReason: 'fixed' })),
    ).toBe('Cedar Creek · Mollie resolved the thread on post abc123 ("fixed").')
  })

  it('post_thread_resolved falls back without reason', () => {
    expect(
      renderSummary(row({ kind: 'post_thread_resolved', postId: 'abc123def456' })),
    ).toBe('Cedar Creek · Mollie resolved the thread on post abc123.')
  })

  it('magic_link_created names recipient and expiry', () => {
    expect(
      renderSummary(row({
        kind: 'magic_link_created',
        recipientName: 'Sam',
        expiresAt: '2026-05-28T00:00:00Z',
      })),
    ).toBe('Cedar Creek · Review link sent to Sam, expires May 28.')
  })

  it('magic_link_visited mentions reviewer and visit type', () => {
    expect(
      renderSummary(row({ kind: 'magic_link_visited', reviewerName: 'Sam', isFirstVisit: true })),
    ).toBe('Cedar Creek · Sam opened the review link (first visit).')
  })

  it('post_caption_ai_fixed names short post ref', () => {
    expect(
      renderSummary(row({ kind: 'post_caption_ai_fixed', postId: 'abc123def456' })),
    ).toBe('Cedar Creek · Mollie used AI to fix the caption on post abc123.')
  })

  it('preview_review_submitted names comment count', () => {
    expect(
      renderSummary(row({ kind: 'preview_review_submitted', commentCount: 4 })),
    ).toBe('Cedar Creek · Mollie finished reviewing the preview (4 comments).')
  })
})

describe('resolveHref, existing kinds', () => {
  it('uses batchId when present in payload', () => {
    expect(
      resolveHref(row({ kind: 'batch_passed', batchId: 'b1' })),
    ).toBe('/clients/c1/batches/b1')
  })

  it('uses runId when no batchId', () => {
    expect(
      resolveHref(row({ kind: 'run_completed' }, { event: {
        id: 'e1', kind: 'run_completed', runId: 'r1', payload: { kind: 'run_completed' },
        createdAt: new Date(), actor: { id: 'u1', name: 'M', avatarUrl: null },
      } as MentionInboxRow['event'] })),
    ).toBe('/clients/c1/runs/r1')
  })

  it('falls back to client root when neither batchId nor runId', () => {
    expect(resolveHref(row({ kind: 'client_am_assigned' }))).toBe('/clients/c1')
  })
})
