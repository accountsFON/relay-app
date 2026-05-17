/**
 * ReviewSubmittedDigestEmail — the digest the AM gets when a client hits
 * Submit Review on a review session. Inlines every Request Changes comment
 * and every Caption Edit diff so the AM can triage the batch from their
 * inbox without opening Relay for routine cases.
 *
 * This is the v2 differentiator vs Filestage and Frame.io: those force the
 * AM to click into each item to see what the reviewer said. Here it is all
 * in the email body.
 *
 * The template intentionally does NOT include approved items in the
 * per-item section — the summary chip row already reports the count, and
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

/** Item shape the digest needs: hydrated review item plus the current Post. */
export interface DigestReviewItem extends ReviewItemHydrated {
  post: {
    id: string
    postDate: Date
    /** CURRENT caption on the Post — used as the baseline for the diff. */
    caption: string
  }
  /** 1-based position in the batch (for "Post #N" display). */
  postNumber: number
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
   * Optional reviewer reply-to email. Informational only — actually
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
  // "Tue May 13" — short weekday + short month + day-of-month. UTC for
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
  const isEdit = item.decision === 'caption_edited'

  const decisionLabel = isChanges
    ? 'Request changes'
    : isEdit
      ? 'Caption edit suggested'
      : ''
  const decisionFg = isChanges ? COLORS.changesFg : COLORS.editFg
  const decisionBg = isChanges ? COLORS.changesBg : COLORS.editBg

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
  // pre-filter — defense in depth keeps the template honest if a future
  // caller forgets.
  const actionableItems = items.filter(
    (i) => i.decision === 'changes_requested' || i.decision === 'caption_edited',
  )

  const previewText =
    `${reviewerName} finished reviewing ${clientName} ${monthLabel} — ` +
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
            <Text style={{ margin: 0 }}>
              Hi {amName}, reply to this email to message {reviewerName} directly.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export default ReviewSubmittedDigestEmail
