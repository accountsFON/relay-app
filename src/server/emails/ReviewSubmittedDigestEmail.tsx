/**
 * ReviewSubmittedDigestEmail: the digest the AM gets when a client hits
 * Submit Review on a review session. Inlines every Request Changes comment
 * and every Caption Edit diff so the AM can triage the batch from their
 * inbox without opening Relay for routine cases.
 *
 * This is the v2 differentiator vs Filestage and Frame.io: those force the
 * AM to click into each item to see what the reviewer said. Here it is all
 * in the email body.
 *
 * The template intentionally does NOT include approved items in the
 * per-item section, the summary chip row already reports the count, and
 * the AM has nothing to act on for approvals. Inlining them would bury
 * the items that actually need attention.
 *
 * Reply-To routing (so the AM hitting Reply lands in the reviewer's
 * inbox) is set by the SEND call in Layer 2 task 2.5, not in the
 * template. The footer copy still tells the AM that Reply will go to the
 * reviewer; the send call is responsible for making that true.
 */

import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { ReviewItemHydrated, ReviewSessionSummary } from '@/types/review-session'
import { diffText, type DiffSegment } from '@/lib/text-diff'

/**
 * One client-left markup pin on a post, surfaced in the AM digest so the AM
 * can see pin-based feedback without opening the batch. Mirrors the
 * `PostThread` + first `PostComment` shape from the threads repo, but flat
 * and email-friendly. We only carry the first comment body (the pin's
 * initial text); subsequent replies live in-app and are not inlined.
 */
export interface DigestPin {
  /** PostThread.id, used as a stable React key. */
  id: string
  /**
   * Position kind. `image` = pinned to a point on the image (x,y are
   * 0..100 percent). `caption` = pinned to a caption character range.
   * `post` = post-level pin (no specific anchor).
   */
  kind: 'image' | 'caption' | 'post'
  /** Image pin x coord (percent, 0..100). Null for non-image pins. */
  imageX: number | null
  /** Image pin y coord (percent, 0..100). Null for non-image pins. */
  imageY: number | null
  /** Caption range start char offset, inclusive. Null for non-caption pins. */
  captionFrom: number | null
  /** Caption range end char offset, exclusive. Null for non-caption pins. */
  captionTo: number | null
  /** First comment body left when the pin was created (i.e. the pin text). */
  body: string
  /** Reviewer display name snapshot at pin time. Falls back to 'Reviewer'. */
  reviewerName: string
}

/** Item shape the digest needs: hydrated review item plus the current Post. */
export interface DigestReviewItem extends ReviewItemHydrated {
  post: {
    id: string
    postDate: Date
    /** CURRENT caption on the Post, used as the baseline for the diff. */
    caption: string
  }
  /** 1-based position in the batch (for "Post #N" display). */
  postNumber: number
  /**
   * Open, client-left markup pins on this post, in creation order.
   * Empty array (not undefined) when the post has none, so callers don't
   * have to special-case the absence. The template suppresses the
   * subsection when this is empty.
   */
  pins: DigestPin[]
}

export interface ReviewSubmittedDigestEmailProps {
  /** AM's first name, e.g. "Caleb". Used in the greeting and footer. */
  amName: string
  /** Client reviewer's display name, e.g. "Sarah". */
  reviewerName: string
  /** Client name, e.g. "My DUI Guy". */
  clientName: string
  /** Month label, e.g. "May 2026". */
  monthLabel: string
  /** Review round number (1 for first review, 2 for re-review, …). */
  round: number
  /** Decision counts at submit time. */
  summary: ReviewSessionSummary
  /** All non-approved items the AM needs to act on, in batch order. */
  items: DigestReviewItem[]
  /** Direct link to the AM-side review session detail page. */
  batchUrl: string
  /** Timestamp of the submit click. */
  submittedAt: Date
  /**
   * Optional reviewer reply-to email. Informational only, actually
   * setting Reply-To happens at the Resend send call.
   */
  reviewerReplyEmail?: string
}

// --- Color tokens (kept inline so the template renders in any email
// client without external CSS). Mirrors the v2 design's decision colors:
// green = approved, orange = changes requested, blue = caption edit.

const COLORS = {
  pageBg: '#f4f4f3',
  cardBg: '#ffffff',
  cardBorder: '#efefee',
  text: '#1a1a1a',
  textMuted: '#666666',
  textFaint: '#888888',
  approvedBg: '#e8f6ec',
  approvedFg: '#1f6d3c',
  changesBg: '#fff1e1',
  changesFg: '#a05a10',
  editBg: '#e6f0ff',
  editFg: '#1a4faa',
  buttonBg: '#1a1a1a',
  buttonFg: '#ffffff',
  diffInsertBg: '#d4f4dc',
  diffInsertFg: '#0e5a2e',
  diffDeleteBg: '#fbe1e1',
  diffDeleteFg: '#8a2424',
  blockquoteBorder: '#d0d0cf',
  blockquoteBg: '#fafafa',
} as const

// --- Formatters. Kept here (not date-fns) to match sendMagicLinkEmail's
// "avoid Intl variance across runtimes" approach. Email rendering happens
// server side at send time, but the snapshot tests use jsdom and Node;
// hardcoded formatting keeps both paths byte-identical.

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

const WEEKDAYS_SHORT = [
  'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat',
] as const

function formatPostDate(d: Date): string {
  // "Tue May 13", short weekday + short month + day-of-month. UTC for
  // determinism across server timezones (post dates are scheduled in UTC).
  return `${WEEKDAYS_SHORT[d.getUTCDay()]} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`
}

function formatSubmittedAt(d: Date): string {
  // "May 13, 2026 at 9:42 AM EDT". We render in America/New_York since
  // the AM team is ET-based; this matches the vault's other timestamp
  // conventions. Intl with a fixed timeZone is deterministic and works
  // in Node, jsdom, and Vercel functions.
  const dateFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const timeFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
  return `${dateFmt.format(d)} at ${timeFmt.format(d)}`
}

/**
 * Human-readable position label for a pin in the email body. We pick the
 * granularity we can render without an image (so AMs reading on mobile,
 * dark mode, or with images blocked still get useful spatial context).
 *
 * Image pins quantize the (x, y) percent coords into a 3x3 grid of
 * descriptive zones ("upper left", "center", "lower right", etc.). Caption
 * pins report the character offset range. Post-level pins say so plainly.
 *
 * Kept here (not in a shared util) because the labels are tuned for an
 * email reader, not the in-app UI which has the visual pin to anchor on.
 */
function pinPositionLabel(pin: DigestPin): string {
  if (pin.kind === 'image' && pin.imageX !== null && pin.imageY !== null) {
    const horiz = pin.imageX < 33 ? 'left' : pin.imageX < 67 ? 'center' : 'right'
    const vert = pin.imageY < 33 ? 'upper' : pin.imageY < 67 ? 'middle' : 'lower'
    // "upper center" reads oddly; collapse to just "top" / "bottom".
    if (horiz === 'center' && vert !== 'middle') {
      const tb = vert === 'upper' ? 'top' : 'bottom'
      return `on image, ${tb} center`
    }
    if (horiz === 'center' && vert === 'middle') {
      return 'on image, center'
    }
    return `on image, ${vert} ${horiz}`
  }
  if (pin.kind === 'caption' && pin.captionFrom !== null && pin.captionTo !== null) {
    return `on caption, chars ${pin.captionFrom}..${pin.captionTo}`
  }
  return 'on post'
}

export function buildSubject(props: ReviewSubmittedDigestEmailProps): string {
  const { reviewerName, clientName, monthLabel, summary } = props
  const parts: string[] = []
  if (summary.changesRequested > 0) {
    parts.push(`${summary.changesRequested} change${summary.changesRequested === 1 ? '' : 's'}`)
  }
  if (summary.captionEdited > 0) {
    parts.push(`${summary.captionEdited} caption edit${summary.captionEdited === 1 ? '' : 's'}`)
  }
  const tail = parts.length === 0
    ? `${summary.approved} approved`
    : parts.join(' + ')
  return `[Five One Nine] ${reviewerName} finished reviewing ${clientName} ${monthLabel}, ${tail}`
}

// --- Sub-components.

function SummaryChip({
  label,
  count,
  bg,
  fg,
}: {
  label: string
  count: number
  bg: string
  fg: string
}) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '6px 14px',
        borderRadius: 999,
        backgroundColor: bg,
        color: fg,
        fontSize: 14,
        fontWeight: 600,
        marginRight: 8,
        marginBottom: 8,
      }}
    >
      {count} {label}
    </span>
  )
}

function DiffSegments({ segments }: { segments: DiffSegment[] }) {
  // Render the jsdiff-shaped segments inline. Strikethrough red for
  // removed text, green-underline for inserted text, plain text for
  // equal segments. We use <span> with inline styles so every email
  // client renders consistently (no class-based styling in email HTML).
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === 'equal') {
          return (
            <span key={i} style={{ color: COLORS.text }}>
              {seg.text}
            </span>
          )
        }
        if (seg.type === 'delete') {
          return (
            <span
              key={i}
              data-diff="delete"
              style={{
                backgroundColor: COLORS.diffDeleteBg,
                color: COLORS.diffDeleteFg,
                textDecoration: 'line-through',
                padding: '0 2px',
              }}
            >
              {seg.text}
            </span>
          )
        }
        return (
          <span
            key={i}
            data-diff="insert"
            style={{
              backgroundColor: COLORS.diffInsertBg,
              color: COLORS.diffInsertFg,
              textDecoration: 'underline',
              padding: '0 2px',
            }}
          >
            {seg.text}
          </span>
        )
      })}
    </>
  )
}

function ItemBlock({
  item,
  batchUrl,
}: {
  item: DigestReviewItem
  batchUrl: string
}) {
  const isChanges = item.decision === 'changes_requested'
  // An approved post that still carries a copy edit reads as a caption edit
  // (P1 #16), mirroring the AM detail page, so the AM sees the suggested copy.
  const isEdit =
    item.decision === 'caption_edited' ||
    (item.decision === 'approved' && item.suggestedCaption != null)
  const isApprovedWithPins =
    item.decision === 'approved' &&
    item.suggestedCaption == null &&
    item.pins.length > 0

  const decisionLabel = isChanges
    ? 'Request changes'
    : isEdit
      ? 'Caption edit suggested'
      : isApprovedWithPins
        ? 'Approved with pins'
        : ''
  const decisionFg = isChanges
    ? COLORS.changesFg
    : isEdit
      ? COLORS.editFg
      : COLORS.approvedFg
  const decisionBg = isChanges
    ? COLORS.changesBg
    : isEdit
      ? COLORS.editBg
      : COLORS.approvedBg

  // Anchor link to the specific post in the AM-side detail page. The
  // detail page (Layer 2 task 2.2) reads the hash and scrolls.
  const itemUrl = `${batchUrl}#post-${item.post.id}`

  return (
    <Section
      data-item-id={item.id}
      data-decision={item.decision}
      style={{
        padding: '20px 0',
        borderTop: `1px solid ${COLORS.cardBorder}`,
      }}
    >
      <Text
        style={{
          margin: 0,
          fontSize: 13,
          color: COLORS.textFaint,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        Post #{item.postNumber}, {formatPostDate(item.post.postDate)}
      </Text>

      <Text
        style={{
          margin: '6px 0 12px',
          display: 'inline-block',
          padding: '4px 10px',
          borderRadius: 6,
          backgroundColor: decisionBg,
          color: decisionFg,
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        Decision: {decisionLabel}
      </Text>

      {isChanges && item.comment ? (
        <blockquote
          style={{
            margin: '8px 0 12px',
            padding: '10px 14px',
            borderLeft: `3px solid ${COLORS.blockquoteBorder}`,
            backgroundColor: COLORS.blockquoteBg,
            color: COLORS.text,
            fontSize: 15,
            lineHeight: 1.5,
            fontStyle: 'italic',
          }}
        >
          {item.comment}
        </blockquote>
      ) : null}

      {isEdit && item.suggestedCaption ? (
        <div style={{ margin: '8px 0 12px' }}>
          <Text
            style={{
              margin: '0 0 6px',
              fontSize: 12,
              color: COLORS.textFaint,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Suggested edit
          </Text>
          <div
            style={{
              padding: '10px 14px',
              borderLeft: `3px solid ${COLORS.editBg}`,
              backgroundColor: COLORS.blockquoteBg,
              fontSize: 15,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            <DiffSegments segments={diffText(item.post.caption, item.suggestedCaption)} />
          </div>
        </div>
      ) : null}

      {/* AM can also leave a comment on a caption edit; render it if
          present alongside the diff. */}
      {isEdit && item.comment ? (
        <blockquote
          style={{
            margin: '8px 0 12px',
            padding: '10px 14px',
            borderLeft: `3px solid ${COLORS.blockquoteBorder}`,
            backgroundColor: COLORS.blockquoteBg,
            color: COLORS.text,
            fontSize: 15,
            lineHeight: 1.5,
            fontStyle: 'italic',
          }}
        >
          {item.comment}
        </blockquote>
      ) : null}

      {/* Pins subsection. Surfaced per post so the AM sees client-left
          markup pins inline. Phase 4 item 22 re-enabled pins on the
          client review surface; without this block the AM had no way to
          see them without opening the batch. Suppressed entirely when
          the post has zero pins (no empty header). */}
      {item.pins.length > 0 ? (
        <div data-section="pins" style={{ margin: '8px 0 12px' }}>
          <Text
            style={{
              margin: '0 0 6px',
              fontSize: 12,
              color: COLORS.textFaint,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Pins ({item.pins.length})
          </Text>
          <ul
            style={{
              margin: 0,
              paddingLeft: 20,
              fontSize: 14,
              lineHeight: 1.5,
              color: COLORS.text,
            }}
          >
            {item.pins.map((pin, idx) => (
              <li
                key={pin.id}
                data-pin-id={pin.id}
                data-pin-kind={pin.kind}
                style={{ marginBottom: 4 }}
              >
                <span style={{ color: COLORS.textMuted }}>
                  [Pin {idx + 1}] {pinPositionLabel(pin)} ({pin.reviewerName}):
                </span>{' '}
                <span style={{ color: COLORS.text }}>{pin.body}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Link
        href={itemUrl}
        style={{
          fontSize: 14,
          color: COLORS.editFg,
          textDecoration: 'none',
          fontWeight: 600,
        }}
      >
        Open in Relay →
      </Link>
    </Section>
  )
}

// --- Top-level template.

export function ReviewSubmittedDigestEmail(props: ReviewSubmittedDigestEmailProps) {
  const {
    amName,
    reviewerName,
    clientName,
    monthLabel,
    round,
    summary,
    items,
    batchUrl,
    submittedAt,
  } = props

  // Only items the AM needs to act on. Approvals are summarized in the
  // chip row and intentionally omitted from the per-item section. We
  // double-filter here even though the Layer 2 send call is supposed to
  // pre-filter; defense in depth keeps the template honest if a future
  // caller forgets.
  //
  // Exception (Wave J4): an approved post with one or more client-left
  // pins still surfaces, because the pin text is feedback the AM needs
  // to see. Without this carve-out the digest would silently swallow
  // pins left on otherwise-approved posts.
  const actionableItems = items.filter(
    (i) =>
      i.decision === 'changes_requested' ||
      i.decision === 'caption_edited' ||
      i.pins.length > 0 ||
      // P1 #16: an approved post that carries a copy edit is not a clean
      // approval -- the AM must see the suggested copy, so surface it here too.
      (i.decision === 'approved' && i.suggestedCaption != null),
  )

  const previewText =
    `${reviewerName} finished reviewing ${clientName} ${monthLabel}: ` +
    `${summary.approved} approved, ${summary.changesRequested} changes, ${summary.captionEdited} edits`

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: COLORS.pageBg,
          fontFamily:
            "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
          color: COLORS.text,
          lineHeight: 1.5,
        }}
      >
        <Container
          style={{
            maxWidth: 600,
            width: '100%',
            margin: '32px auto',
            backgroundColor: COLORS.cardBg,
            borderRadius: 14,
            overflow: 'hidden',
            padding: '0',
          }}
        >
          {/* Brand strip */}
          <Section
            style={{
              padding: '20px 32px',
              borderBottom: `1px solid ${COLORS.cardBorder}`,
            }}
          >
            <Text
              style={{
                margin: 0,
                fontSize: 12,
                letterSpacing: '1px',
                textTransform: 'uppercase',
                color: COLORS.textFaint,
              }}
            >
              Five One Nine Marketing
            </Text>
            <Text
              style={{
                margin: '4px 0 0',
                fontSize: 13,
                color: COLORS.textMuted,
              }}
            >
              Review submitted
            </Text>
          </Section>

          {/* Header */}
          <Section style={{ padding: '28px 32px 8px' }}>
            <Heading
              as="h1"
              style={{
                margin: '0 0 6px',
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: '-0.01em',
                color: COLORS.text,
              }}
            >
              {reviewerName} finished their review
            </Heading>
            <Text
              style={{
                margin: 0,
                fontSize: 15,
                color: COLORS.textMuted,
              }}
            >
              {clientName} · {monthLabel} · Round {round}
            </Text>
          </Section>

          {/* Summary chips */}
          <Section style={{ padding: '20px 32px 4px' }}>
            <SummaryChip
              label="Approved"
              count={summary.approved}
              bg={COLORS.approvedBg}
              fg={COLORS.approvedFg}
            />
            <SummaryChip
              label="Changes"
              count={summary.changesRequested}
              bg={COLORS.changesBg}
              fg={COLORS.changesFg}
            />
            <SummaryChip
              label="Edits"
              count={summary.captionEdited}
              bg={COLORS.editBg}
              fg={COLORS.editFg}
            />
            <Text
              style={{
                margin: '8px 0 0',
                fontSize: 13,
                color: COLORS.textFaint,
              }}
            >
              {summary.totalPosts} post{summary.totalPosts === 1 ? '' : 's'} in this batch
            </Text>
          </Section>

          {/* Per-item details */}
          {actionableItems.length > 0 ? (
            <Section
              data-section="items"
              style={{ padding: '8px 32px 16px' }}
            >
              {actionableItems.map((item) => (
                <ItemBlock key={item.id} item={item} batchUrl={batchUrl} />
              ))}
            </Section>
          ) : (
            <Section style={{ padding: '8px 32px 16px' }}>
              <Text
                style={{
                  margin: '12px 0',
                  fontSize: 15,
                  color: COLORS.textMuted,
                  fontStyle: 'italic',
                }}
              >
                Every post was approved with no changes or caption edits. Nothing to triage.
              </Text>
            </Section>
          )}

          <Hr style={{ borderColor: COLORS.cardBorder, margin: '0 32px' }} />

          {/* Big CTA */}
          <Section style={{ padding: '24px 32px', textAlign: 'center' }}>
            <Link
              href={batchUrl}
              style={{
                display: 'inline-block',
                backgroundColor: COLORS.buttonBg,
                color: COLORS.buttonFg,
                textDecoration: 'none',
                padding: '14px 28px',
                borderRadius: 999,
                fontWeight: 600,
                fontSize: 16,
              }}
            >
              Open the full review in Relay →
            </Link>
          </Section>

          {/* Footer */}
          <Section
            style={{
              padding: '20px 32px 28px',
              borderTop: `1px solid ${COLORS.cardBorder}`,
              fontSize: 13,
              color: COLORS.textMuted,
            }}
          >
            <Text style={{ margin: '0 0 8px' }}>
              {reviewerName} submitted at {formatSubmittedAt(submittedAt)}.
            </Text>
            <Text style={{ margin: '0 0 12px' }}>
              Hi {amName}, reply to this email to message {reviewerName} directly.
            </Text>
            <Text style={{ margin: 0, fontSize: 12, color: '#999' }}>
              Need help? <Link href="mailto:support@fonmarketing.com" style={{ color: '#999', textDecoration: 'underline' }}>support@fonmarketing.com</Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export default ReviewSubmittedDigestEmail
