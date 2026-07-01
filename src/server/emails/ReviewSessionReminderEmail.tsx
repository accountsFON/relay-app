/**
 * ReviewSessionReminderEmail , React Email template for the automatic
 * "you started reviewing but haven't submitted" nudge.
 *
 * Sent by the sendReviewReminders cron at 48h and 96h after the
 * ReviewSession.startedAt timestamp. Same visual language as
 * MagicLinkInviteEmail so the recipient recognizes it as part of the
 * same thread of communication. Subject is owned by the caller; this
 * file only renders the body.
 *
 * Spec: projects/relay-app/2026-05-19-reviewer-reminder-cron-design.md
 */

import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import { greetingName } from '@/lib/greeting'

export interface ReviewSessionReminderEmailProps {
  /// Full reviewer name. Greeting uses the full name (see greetingName).
  reviewerName: string
  /// Client display name, e.g. "My DUI Guy".
  clientName: string
  /// Display label like "May 2026".
  batchLabel: string
  /// AM display name, used in the signoff.
  amName: string
  /// Decisions already recorded (anything other than 'not_reviewed').
  reviewedCount: number
  /// Total posts in the batch.
  totalCount: number
  /// Fully qualified URL the reviewer clicks to resume.
  reviewUrl: string
  /// Which threshold triggered this send. Affects opening copy + preview text.
  threshold: '48h' | '96h'
}

// Style tokens mirror MagicLinkInviteEmail so the visual treatment stays
// consistent across the invite + reminder + digest thread. Inline styles
// are intentional; email clients ignore most external CSS.
const bodyStyle: React.CSSProperties = {
  margin: 0,
  padding: 0,
  background: '#f4f4f3',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  color: '#1a1a1a',
  lineHeight: 1.5,
}

const containerStyle: React.CSSProperties = {
  maxWidth: 560,
  width: '100%',
  background: '#ffffff',
  borderRadius: 14,
  overflow: 'hidden',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  margin: '32px auto',
}

const headerSectionStyle: React.CSSProperties = {
  padding: '24px 32px',
  borderBottom: '1px solid #efefee',
}

const brandStyle: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: 1,
  textTransform: 'uppercase',
  color: '#888',
  margin: 0,
}

const brandSubStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#999',
  marginTop: 4,
  marginBottom: 0,
}

const bodySectionStyle: React.CSSProperties = {
  padding: '28px 32px 8px',
}

const h1Style: React.CSSProperties = {
  margin: '0 0 14px',
  fontSize: 22,
  fontWeight: 600,
  letterSpacing: '-0.01em',
}

const paragraphStyle: React.CSSProperties = {
  margin: '0 0 14px',
  fontSize: 16,
}

const ctaSectionStyle: React.CSSProperties = {
  padding: '18px 32px 28px',
  textAlign: 'center',
}

const buttonStyle: React.CSSProperties = {
  display: 'inline-block',
  background: '#1a1a1a',
  color: '#ffffff',
  textDecoration: 'none',
  padding: '14px 28px',
  borderRadius: 999,
  fontWeight: 600,
  fontSize: 16,
}

const fallbackSectionStyle: React.CSSProperties = {
  padding: '0 32px 24px',
}

const fallbackStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#999',
  borderTop: '1px solid #efefee',
  paddingTop: 16,
  wordBreak: 'break-all',
  margin: 0,
}

const fallbackLinkStyle: React.CSSProperties = {
  color: '#666',
}

const footerSectionStyle: React.CSSProperties = {
  padding: '16px 32px 24px',
  borderTop: '1px solid #efefee',
  fontSize: 13,
  color: '#888',
}

const signatureStyle: React.CSSProperties = {
  marginTop: 14,
  marginBottom: 0,
  color: '#666',
}

export function ReviewSessionReminderEmail(
  props: ReviewSessionReminderEmailProps,
): React.ReactElement {
  const {
    reviewerName,
    clientName,
    batchLabel,
    amName,
    reviewedCount,
    totalCount,
    reviewUrl,
    threshold,
  } = props

  const greetName = greetingName(reviewerName)

  // 48h vs 96h diverge in the opener and preview only; the rest of the
  // body, CTA, and signoff are shared.
  const opener =
    threshold === '48h'
      ? `You started reviewing ${clientName}'s ${batchLabel} posts a couple days back and got partway through (${reviewedCount} of ${totalCount} reviewed).`
      : `It's been a few days, just a friendly nudge: ${clientName}'s ${batchLabel} review is still waiting on you (${reviewedCount} of ${totalCount} reviewed).`

  const preview =
    threshold === '48h'
      ? `Finish reviewing ${clientName}'s ${batchLabel} posts`
      : `Still here when you're ready: ${clientName}'s ${batchLabel} posts`

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={headerSectionStyle}>
            <Text style={brandStyle}>Five One Nine Marketing</Text>
            <Text style={brandSubStyle}>Review reminder</Text>
          </Section>

          <Section style={bodySectionStyle}>
            <Text style={h1Style}>{`Hey ${greetName},`}</Text>
            <Text style={paragraphStyle}>{opener}</Text>
            <Text style={paragraphStyle}>
              The link is still good and your decisions are saved. Finish whenever
              you have a minute.
            </Text>
          </Section>

          <Section style={ctaSectionStyle}>
            <Button href={reviewUrl} style={buttonStyle}>
              Finish reviewing
            </Button>
          </Section>

          <Section style={fallbackSectionStyle}>
            <Text style={fallbackStyle}>
              Button not working? Paste this URL into your browser:
              <br />
              <Link href={reviewUrl} style={fallbackLinkStyle}>
                {reviewUrl}
              </Link>
            </Text>
          </Section>

          <Section style={footerSectionStyle}>
            <Text style={{ margin: 0 }}>Reply to this email if anything is unclear.</Text>
            <Text style={signatureStyle}>
              {amName}
              <br />
              Five One Nine Marketing
            </Text>
          </Section>
          <Hr style={{ display: 'none' }} />
        </Container>
      </Body>
    </Html>
  )
}

export default ReviewSessionReminderEmail
