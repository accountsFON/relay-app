/**
 * Tests for the ReviewSubmittedDigestEmail React Email template.
 *
 * We render the component to HTML via @react-email/render and then assert
 * against the resulting markup. This catches the things that matter for an
 * email body — content presence, layout sections, and the diff colors —
 * without coupling tests to specific inline-style strings.
 */

import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import {
  ReviewSubmittedDigestEmail,
  type DigestPin,
  type DigestReviewItem,
  type ReviewSubmittedDigestEmailProps,
} from '@/server/emails/ReviewSubmittedDigestEmail'

function makePin(overrides: Partial<DigestPin> & { id: string }): DigestPin {
  const base: DigestPin = {
    id: overrides.id,
    kind: 'post',
    imageX: null,
    imageY: null,
    captionFrom: null,
    captionTo: null,
    body: '',
    reviewerName: 'Sarah',
  }
  return { ...base, ...overrides }
}

/**
 * Helpers: React inserts <!-- --> comments between adjacent text
 * expressions (so the runtime can hydrate them) and HTML-escapes
 * apostrophes / quotes. For content-presence assertions we want neither
 * to matter — strip both before grepping. We keep the raw HTML around
 * for attribute checks (data-diff, hrefs) where escaping doesn't apply.
 */
function plain(html: string): string {
  return html
    .replace(/<!--[^]*?-->/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function makeItem(overrides: Partial<DigestReviewItem> & { id: string; postNumber: number }): DigestReviewItem {
  const base: DigestReviewItem = {
    id: overrides.id,
    postId: `post-${overrides.id}`,
    decision: 'approved',
    comment: null,
    suggestedCaption: null,
    acceptedAsPostVersionId: null,
    addressedAt: null,
    updatedSinceLastReview: false,
    lastReviewedVersionId: null,
    reviewedAt: null,
    postNumber: overrides.postNumber,
    post: {
      id: `post-${overrides.id}`,
      postDate: new Date(Date.UTC(2026, 4, 13)), // Wed May 13 2026 in UTC -> Tue May 13 in some TZs; UTC weekday Wed.
      caption: 'Welcome to our new patio space. Sundays just got better.',
    },
    pins: [],
  }
  return { ...base, ...overrides }
}

function baseProps(items: DigestReviewItem[]): ReviewSubmittedDigestEmailProps {
  const summary = {
    approved: items.filter((i) => i.decision === 'approved').length,
    changesRequested: items.filter((i) => i.decision === 'changes_requested').length,
    captionEdited: items.filter((i) => i.decision === 'caption_edited').length,
    totalPosts: 13,
  }
  return {
    amName: 'Caleb',
    reviewerName: 'Sarah',
    clientName: 'My DUI Guy',
    monthLabel: 'May 2026',
    round: 1,
    summary,
    items,
    batchUrl: 'https://relay.fiveoninenine.com/clients/abc/batches/xyz/review-sessions/sess-1',
    submittedAt: new Date(Date.UTC(2026, 4, 13, 13, 42)), // 9:42 AM EDT
    reviewerReplyEmail: 'sarah@mydui.example',
  }
}

describe('ReviewSubmittedDigestEmail', () => {
  it('renders the summary chip row with each decision count', async () => {
    const items: DigestReviewItem[] = []
    const props = baseProps(items)
    // Override summary explicitly — items array can be empty for this check.
    props.summary = { approved: 8, changesRequested: 4, captionEdited: 1, totalPosts: 13 }
    const html = await render(<ReviewSubmittedDigestEmail {...props} />)
    const text = plain(html)

    // Each chip should appear with its count + label.
    expect(text).toContain('8 Approved')
    expect(text).toContain('4 Changes')
    expect(text).toContain('1 Edits')
    expect(text).toContain('13 posts in this batch')

    // Header copy.
    expect(text).toContain('Sarah finished their review')
    expect(text).toContain('My DUI Guy')
    expect(text).toContain('May 2026')
    expect(text).toContain('Round 1')
  })

  it('renders request-changes items with the client comment in a blockquote', async () => {
    const items = [
      makeItem({
        id: 'r1',
        postNumber: 5,
        decision: 'changes_requested',
        comment:
          "Can we say 'free consultation' instead of 'free quote'? That's how I refer to it on the phone.",
      }),
      makeItem({
        id: 'r2',
        postNumber: 7,
        decision: 'changes_requested',
        comment:
          'Image looks like a stock photo. Can we use the one of me at the conference table instead?',
      }),
    ]
    const html = await render(<ReviewSubmittedDigestEmail {...baseProps(items)} />)
    const text = plain(html)

    // Both comments appear verbatim (apostrophes already de-escaped).
    expect(text).toContain("'free consultation'")
    expect(text).toContain("'free quote'")
    expect(text).toContain('stock photo')
    expect(text).toContain('conference table')

    // Decision label shows up for each.
    const decisionMatches = text.match(/Decision: Request changes/g) ?? []
    expect(decisionMatches.length).toBe(2)

    // Per-item Open in Relay links use the anchor pattern (hrefs aren't
    // affected by the React comment quirk).
    expect(html).toContain('#post-post-r1')
    expect(html).toContain('#post-post-r2')

    // Big CTA still present.
    expect(text).toContain('Open the full review in Relay')
  })

  it('renders caption-edited items with an inline word-level diff (added + removed segments)', async () => {
    const items = [
      makeItem({
        id: 'e1',
        postNumber: 3,
        decision: 'caption_edited',
        suggestedCaption:
          'Welcome to our outdoor seating area. Sundays just got better.',
        post: {
          id: 'post-e1',
          postDate: new Date(Date.UTC(2026, 4, 12)),
          caption:
            'Welcome to our new patio space. Sundays just got better.',
        },
      }),
    ]
    const html = await render(<ReviewSubmittedDigestEmail {...baseProps(items)} />)
    const text = plain(html)

    // Decision label.
    expect(text).toContain('Decision: Caption edit suggested')

    // The diff renderer tags inserts and deletes with data-diff attributes
    // so we can assert without depending on specific inline styles. We
    // check the raw HTML (attributes survive escaping) for these.
    expect(html).toContain('data-diff="insert"')
    expect(html).toContain('data-diff="delete"')

    // The changed words should appear in the rendered output. The
    // current word-level diff implementation tokenises on whitespace
    // and segments are split per-token, so we look for each removed +
    // added word individually rather than as a contiguous phrase.
    for (const removed of ['new', 'patio', 'space']) {
      expect(text).toContain(removed)
    }
    for (const added of ['outdoor', 'seating', 'area']) {
      expect(text).toContain(added)
    }

    // Equal text on both sides of the change is preserved.
    expect(text).toContain('Welcome to our')
    expect(text).toContain('Sundays just got better')
  })

  it('omits approved items from the per-item section', async () => {
    const items = [
      makeItem({ id: 'a1', postNumber: 1, decision: 'approved' }),
      makeItem({ id: 'a2', postNumber: 2, decision: 'approved' }),
      makeItem({
        id: 'r1',
        postNumber: 3,
        decision: 'changes_requested',
        comment: 'Tweak the headline please.',
      }),
    ]
    const html = await render(<ReviewSubmittedDigestEmail {...baseProps(items)} />)
    const text = plain(html)

    // The changes item shows up.
    expect(text).toContain('Tweak the headline please.')
    expect(html).toContain('#post-post-r1')

    // The approved items do NOT render as item blocks (no "Decision:
    // Approved" label, no per-item anchor link to their post ids).
    expect(text).not.toContain('Decision: Approved')
    expect(html).not.toContain('#post-post-a1')
    expect(html).not.toContain('#post-post-a2')

    // And approved items' "Post #1" / "Post #2" labels do not appear
    // in the per-item section. (We only render "Post #N" inside the
    // ItemBlock.) Post #3 is the changes_requested item.
    expect(text).not.toMatch(/Post #1,/)
    expect(text).not.toMatch(/Post #2,/)
    expect(text).toMatch(/Post #3,/)
  })

  it('renders a Pins subsection on a changes-requested item, with count, position label, and body', async () => {
    const items = [
      makeItem({
        id: 'r1',
        postNumber: 4,
        decision: 'changes_requested',
        comment: 'Headline could be tighter.',
        pins: [
          makePin({
            id: 'pin-a',
            kind: 'image',
            imageX: 12,
            imageY: 18,
            body: 'fix this typo',
            reviewerName: 'Sarah',
          }),
          makePin({
            id: 'pin-b',
            kind: 'caption',
            captionFrom: 4,
            captionTo: 13,
            body: 'wording feels off here',
            reviewerName: 'Sarah',
          }),
        ],
      }),
    ]
    const html = await render(<ReviewSubmittedDigestEmail {...baseProps(items)} />)
    const text = plain(html)

    // Subsection heading shows the pin count.
    expect(text).toContain('Pins (2)')

    // Each pin renders with its index, position label, reviewer, and body.
    expect(text).toContain('[Pin 1] on image, upper left (Sarah):')
    expect(text).toContain('fix this typo')
    expect(text).toContain('[Pin 2] on caption, chars 4..13 (Sarah):')
    expect(text).toContain('wording feels off here')

    // Pin rows carry data-pin-* attributes for downstream tests / parsers.
    expect(html).toContain('data-pin-id="pin-a"')
    expect(html).toContain('data-pin-kind="image"')
    expect(html).toContain('data-pin-id="pin-b"')
    expect(html).toContain('data-pin-kind="caption"')
  })

  it('omits the Pins subsection entirely when a post has zero pins', async () => {
    const items = [
      makeItem({
        id: 'r1',
        postNumber: 1,
        decision: 'changes_requested',
        comment: 'Please reshoot.',
        pins: [],
      }),
    ]
    const html = await render(<ReviewSubmittedDigestEmail {...baseProps(items)} />)
    const text = plain(html)

    // The comment still renders.
    expect(text).toContain('Please reshoot.')

    // No Pins header, no pin list markup.
    expect(text).not.toMatch(/Pins \(/)
    expect(html).not.toContain('data-section="pins"')
  })

  it('surfaces an approved post when it carries client-left pins, with the Approved-with-pins label', async () => {
    const items = [
      makeItem({
        id: 'a1',
        postNumber: 2,
        decision: 'approved',
        pins: [
          makePin({
            id: 'pin-c',
            kind: 'post',
            body: 'love this, ship it',
            reviewerName: 'Sarah',
          }),
        ],
      }),
    ]
    const html = await render(<ReviewSubmittedDigestEmail {...baseProps(items)} />)
    const text = plain(html)

    // The approved-with-pins post is rendered as an item block.
    expect(text).toMatch(/Post #2,/)
    expect(text).toContain('Approved with pins')

    // Pin body shows up.
    expect(text).toContain('Pins (1)')
    expect(text).toContain('[Pin 1] on post (Sarah):')
    expect(text).toContain('love this, ship it')

    // Anchor link is present even on approved-with-pins items so the AM
    // can click through.
    expect(html).toContain('#post-post-a1')
  })

  it('omits an approved post with no pins from the per-item section (regression check on the new filter)', async () => {
    const items = [
      makeItem({ id: 'a1', postNumber: 1, decision: 'approved', pins: [] }),
    ]
    const html = await render(<ReviewSubmittedDigestEmail {...baseProps(items)} />)
    const text = plain(html)

    // Approved-with-zero-pins still falls through to the "nothing to triage" copy.
    expect(text).toContain('Every post was approved')
    expect(text).not.toMatch(/Post #1,/)
  })
})
