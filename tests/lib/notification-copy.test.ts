import { describe, it, expect } from 'vitest'
import { renderSummary, resolveHref } from '@/lib/notification-copy'
import type { MentionInboxRow } from '@/components/activity/types'

/**
 * Test row factory.
 *
 * Mirrors the production data shape: ActivityEvent.kind is set on the event
 * column, NOT inside the JSONB payload. Emit sites in the codebase do not
 * inject `kind` into the payload object (see preview-review-emit.ts,
 * threads.ts, magicLink.ts, posts.ts, reviewSessions.ts).
 *
 * Callers may still pass `kind` inside the first arg for ergonomics; the
 * factory extracts it onto `event.kind` and strips it from the payload so
 * tests exercise the production shape (no `kind` in payload).
 */
function row(input: Record<string, unknown>, overrides: Partial<MentionInboxRow> = {}): MentionInboxRow {
  const { kind, ...payloadWithoutKind } = input
  return {
    mentionId: 'm1',
    readAt: null,
    client: { id: 'c1', name: 'Cedar Creek', ...(overrides.client ?? {}) },
    postBatchId: overrides.postBatchId ?? null,
    event: {
      id: 'e1',
      createdAt: new Date('2026-05-21T12:00:00Z'),
      kind: kind as MentionInboxRow['event']['kind'],
      payload: payloadWithoutKind as MentionInboxRow['event']['payload'],
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
      'Cedar Creek · Content generation complete: 30 posts ready for your review.',
    )
  })

  it('run_completed falls back without post count', () => {
    expect(renderSummary(row({ kind: 'run_completed' }))).toBe(
      'Cedar Creek · Content generation complete: posts ready for your review.',
    )
  })

  it('client_am_assigned names client', () => {
    expect(renderSummary(row({ kind: 'client_am_assigned' }))).toBe(
      'Cedar Creek · Mollie assigned you as the Account Manager for Cedar Creek.',
    )
  })

  it('client_am_unassigned names client', () => {
    expect(renderSummary(row({ kind: 'client_am_unassigned' }))).toBe(
      'Cedar Creek · Mollie removed you as the Account Manager for Cedar Creek.',
    )
  })

  it('client_designer_unassigned names client', () => {
    expect(renderSummary(row({ kind: 'client_designer_unassigned' }))).toBe(
      'Cedar Creek · Mollie removed you as the Designer for Cedar Creek.',
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

  it('renders copy for revision_images_requested', () => {
    const summary = renderSummary(
      row({ kind: 'revision_images_requested', batchLabel: 'May batch' }),
    )
    expect(summary).toMatch(/image revisions requested/i)
    expect(summary).not.toMatch(/someone/i)
  })
})

describe('renderSummary, AM / admin holder override', () => {
  // Audit-only flag: when the actor overrides the holder (AM/admin/platform
  // owner advancing a batch they don't hold), the renderer prefixes the
  // copy with "overrode the holder and ..." so the recipient sees who
  // bypassed the queue.

  it('batch_passed prefixes "overrode the holder and passed" when wasOverride=true', () => {
    expect(
      renderSummary(
        row({
          kind: 'batch_passed',
          batchLabel: 'May batch',
          toStep: 'copy_step',
          wasOverride: true,
        }),
      ),
    ).toMatch(/Mollie overrode the holder and passed "May batch" to you/)
  })

  it('batch_passed keeps "passed" when wasOverride absent', () => {
    expect(
      renderSummary(
        row({ kind: 'batch_passed', batchLabel: 'May batch', toStep: 'copy_step' }),
      ),
    ).toMatch(/Mollie passed "May batch" to you/)
    expect(
      renderSummary(
        row({ kind: 'batch_passed', batchLabel: 'May batch', toStep: 'copy_step' }),
      ),
    ).not.toMatch(/overrode the holder/)
  })

  it('batch_sent_back prefixes "overrode the holder and sent" when wasOverride=true', () => {
    expect(
      renderSummary(
        row({ kind: 'batch_sent_back', batchLabel: 'May batch', wasOverride: true }),
      ),
    ).toBe(
      'Cedar Creek · Mollie overrode the holder and sent "May batch" back to you for changes.',
    )
  })

  it('batch_sent_back keeps "sent ... back" when wasOverride absent', () => {
    expect(
      renderSummary(row({ kind: 'batch_sent_back', batchLabel: 'May batch' })),
    ).toBe('Cedar Creek · Mollie sent "May batch" back to you for changes.')
  })

  it('batch_completed renders "finished" when wasOverride absent', () => {
    expect(
      renderSummary(row({ kind: 'batch_completed', batchLabel: 'May batch' })),
    ).toBe('Cedar Creek · Mollie finished "May batch".')
  })

  it('batch_completed prefixes "overrode the holder and finished" when wasOverride=true', () => {
    expect(
      renderSummary(
        row({ kind: 'batch_completed', batchLabel: 'May batch', wasOverride: true }),
      ),
    ).toBe('Cedar Creek · Mollie overrode the holder and finished "May batch".')
  })

  it('batch_completed falls back to default relay label when batchLabel missing', () => {
    expect(renderSummary(row({ kind: 'batch_completed' }))).toBe(
      'Cedar Creek · Mollie finished a relay.',
    )
  })
})

describe('renderSummary, production payload shape (no kind in payload)', () => {
  // Regression: real emit sites (preview-review-emit.ts, threads.ts,
  // magicLink.ts, posts.ts, reviewSessions.ts) set ActivityEvent.kind on the
  // column but do NOT inject `kind` into the JSONB payload. Switching on
  // payload.kind would silently fall through to the generic default copy.
  // These tests pin the row.event.kind switch to the production shape.

  it('batch_passed renders without kind in payload', () => {
    const r: MentionInboxRow = {
      mentionId: 'm1',
      readAt: null,
      client: { id: 'c1', name: 'Cedar Creek' },
      event: {
        id: 'e1',
        createdAt: new Date('2026-05-21T12:00:00Z'),
        kind: 'batch_passed' as MentionInboxRow['event']['kind'],
        payload: { batchLabel: 'May batch' } as unknown as MentionInboxRow['event']['payload'],
        actor: { id: 'u1', name: 'Mollie', avatarUrl: null },
        runId: null,
      } as MentionInboxRow['event'],
    } as MentionInboxRow
    expect(renderSummary(r)).toBe('Cedar Creek · Mollie passed "May batch" to you.')
  })

  it('preview_review_submitted renders without kind in payload', () => {
    const r: MentionInboxRow = {
      mentionId: 'm1',
      readAt: null,
      client: { id: 'c1', name: 'Cedar Creek' },
      event: {
        id: 'e1',
        createdAt: new Date('2026-05-21T12:00:00Z'),
        kind: 'preview_review_submitted' as MentionInboxRow['event']['kind'],
        payload: { batchId: 'b1', commentCount: 4 } as unknown as MentionInboxRow['event']['payload'],
        actor: { id: 'u1', name: 'Mollie', avatarUrl: null },
        runId: null,
      } as MentionInboxRow['event'],
    } as MentionInboxRow
    expect(renderSummary(r)).toBe('Cedar Creek · Mollie finished reviewing the preview (4 comments).')
  })
})

describe('resolveHref, existing kinds', () => {
  it('batch event routes to the batch page with a #comment fragment', () => {
    expect(
      resolveHref(row({ kind: 'batch_passed', batchId: 'b1' })),
    ).toBe('/clients/c1/batches/b1#comment-e1')
  })

  it('uses runId (no fragment) when no batchId or post', () => {
    expect(
      resolveHref(row({ kind: 'run_completed' }, { event: {
        id: 'e1', kind: 'run_completed', runId: 'r1', payload: {},
        createdAt: new Date(), actor: { id: 'u1', name: 'M', avatarUrl: null },
      } as MentionInboxRow['event'] })),
    ).toBe('/clients/c1/runs/r1')
  })

  it('falls back to the client root with a #comment fragment', () => {
    expect(resolveHref(row({ kind: 'client_am_assigned' }))).toBe(
      '/clients/c1#comment-e1',
    )
  })

  it('anchors revision_images_requested to the review session page', () => {
    expect(
      resolveHref(
        row({ kind: 'revision_images_requested', batchId: 'b1', reviewSessionId: 's1' }),
      ),
    ).toBe('/clients/c1/batches/b1/review-sessions/s1')
  })

  it('anchors review_session_submitted to the review session page (deep-link fix)', () => {
    expect(
      resolveHref(
        row({ kind: 'review_session_submitted', batchId: 'b1', reviewSessionId: 's1' }),
      ),
    ).toBe('/clients/c1/batches/b1/review-sessions/s1')
  })
})

describe('resolveHref, post-targeted events', () => {
  it('post event with a resolvable batch routes to the batch page with #post', () => {
    expect(
      resolveHref(
        row(
          { kind: 'post_thread_opened' },
          {
            postBatchId: 'b9',
            event: {
              id: 'e1',
              kind: 'post_thread_opened',
              postId: 'p7',
              runId: null,
              payload: {},
              createdAt: new Date('2026-05-21T12:00:00Z'),
              actor: { id: 'u1', name: 'Mollie', avatarUrl: null },
            } as MentionInboxRow['event'],
          },
        ),
      ),
    ).toBe('/clients/c1/batches/b9#post-p7')
  })

  it('post event takes precedence over a batchId in the payload', () => {
    expect(
      resolveHref(
        row(
          { kind: 'post_thread_opened', batchId: 'b1' },
          {
            postBatchId: 'b9',
            event: {
              id: 'e1',
              kind: 'post_thread_opened',
              postId: 'p7',
              runId: null,
              payload: { batchId: 'b1' },
              createdAt: new Date('2026-05-21T12:00:00Z'),
              actor: { id: 'u1', name: 'Mollie', avatarUrl: null },
            } as MentionInboxRow['event'],
          },
        ),
      ),
    ).toBe('/clients/c1/batches/b9#post-p7')
  })

  it('orphaned post (postId set, no batch) falls back to the client root', () => {
    expect(
      resolveHref(
        row(
          { kind: 'post_thread_opened' },
          {
            postBatchId: null,
            event: {
              id: 'e1',
              kind: 'post_thread_opened',
              postId: 'p7',
              runId: null,
              payload: {},
              createdAt: new Date('2026-05-21T12:00:00Z'),
              actor: { id: 'u1', name: 'Mollie', avatarUrl: null },
            } as MentionInboxRow['event'],
          },
        ),
      ),
    ).toBe('/clients/c1#comment-e1')
  })
})

describe('renderSummary, batch_force_stepped', () => {
  it('renders the force moved copy with batch label and step label', () => {
    expect(
      renderSummary(row({ kind: 'batch_force_stepped', batchLabel: 'May batch', toStep: 'copy' })),
    ).toBe('Cedar Creek · Mollie force moved "May batch" to Copy.')
  })

  it('falls back to "a relay" when batchLabel is missing', () => {
    expect(
      renderSummary(row({ kind: 'batch_force_stepped', toStep: 'copy' })),
    ).toBe('Cedar Creek · Mollie force moved a relay to Copy.')
  })

  it('omits the step tail when toStep is missing', () => {
    expect(
      renderSummary(row({ kind: 'batch_force_stepped', batchLabel: 'May batch' })),
    ).toBe('Cedar Creek · Mollie force moved "May batch".')
  })
})
