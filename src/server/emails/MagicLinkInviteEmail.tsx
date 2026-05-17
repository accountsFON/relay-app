/**
 * MagicLinkInviteEmail , React Email template for the client-facing
 * magic link invitation.
 *
 * Visual parity with the v1 inline buildHtml() pair in
 * src/server/services/sendMagicLinkEmail.ts: bordered card on a soft
 * background, Five One Nine Marketing header, client + month as h1,
 * intro paragraph, prominent CTA button, plain URL fallback below the
 * button, footer with expiry + sender name + reply hint.
 *
 * Wire-up to sendMagicLinkEmail happens in Layer 3 task 3.2. This file
 * is the template only.
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

export interface MagicLinkInviteEmailProps {
  /** Full name of the recipient, e.g. "Sarah Smith". */
  recipientName: string
  /** Client display name, e.g. "My DUI Guy". */
  clientName: string
  /** YYYY-MM display string, e.g. "May 2026". */
  monthLabel: string
  /** Fully qualified URL the AM just generated. */
  reviewUrl: string
  /** AM name, used in the footer signature. */
  senderName: string
  /** Expiry timestamp for the magic link. */
  expiresAt: Date
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function firstName(full: string): string {
  const trimmed = full.trim()
  if (!trimmed) return 'there'
  return trimmed.split(/\s+/)[0]
}

function formatExpiry(d: Date): string {
  // Avoid Intl variance across runtimes , render as "May 31, 2026".
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

// Style tokens mirroring the v1 buildHtml output so the visual treatment
// stays consistent through the migration. Inline styles are intentional;
// email clients ignore most external CSS.
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

const titleSectionStyle: React.CSSProperties = {
  padding: '28px 32px 8px',
}

const h1Style: React.CSSProperties = {
  margin: '0 0 4px',
  fontSize: 22,
  fontWeight: 600,
  letterSpacing: '-0.01em',
}

const subtitleStyle: React.CSSProperties = {
  fontSize: 15,
  color: '#666',
  margin: 0,
}

const bodySectionStyle: React.CSSProperties = {
  padding: '20px 32px 8px',
}

const paragraphStyle: React.CSSProperties = {
  margin: '0 0 14px',
  fontSize: 16,
}

const mutedParagraphStyle: React.CSSProperties = {
  margin: '0 0 14px',
  fontSize: 16,
  color: '#666',
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

const supportLineStyle: React.CSSProperties = {
  marginTop: 16,
  marginBottom: 0,
  fontSize: 12,
  color: '#999',
}

const supportLinkStyle: React.CSSProperties = {
  color: '#999',
  textDecoration: 'underline',
}

export function MagicLinkInviteEmail(props: MagicLinkInviteEmailProps): React.ReactElement {
  const {
    recipientName,
    clientName,
    monthLabel,
    reviewUrl,
    senderName,
    expiresAt,
  } = props

  const fname = firstName(recipientName)
  const expires = formatExpiry(expiresAt)
  const previewText = `${clientName} ${monthLabel} posts are ready for your review`

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={headerSectionStyle}>
            <Text style={brandStyle}>Five One Nine Marketing</Text>
            <Text style={brandSubStyle}>Review request</Text>
          </Section>

          <Section style={titleSectionStyle}>
            <Text style={h1Style as React.CSSProperties} role="heading" aria-level={1}>
              {clientName}
            </Text>
            <Text style={subtitleStyle}>{monthLabel} posts ready for your review</Text>
          </Section>

          <Section style={bodySectionStyle}>
            <Text style={paragraphStyle}>Hi {fname},</Text>
            <Text style={paragraphStyle}>
              The {monthLabel} posts are ready. Open the link below to see each post
              rendered as it will appear on Instagram and Facebook, leave any feedback
              right on the post, and we will take it from there.
            </Text>
            <Text style={mutedParagraphStyle}>
              No login or account needed. The link is yours.
            </Text>
          </Section>

          <Section style={ctaSectionStyle}>
            <Button href={reviewUrl} style={buttonStyle}>
              Review the batch
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
            <Text style={{ margin: 0 }}>
              Link expires {expires}. Questions? Just reply to this email.
            </Text>
            <Text style={signatureStyle}>
              {senderName}
              <br />
              Five One Nine Marketing
            </Text>
            <Text style={supportLineStyle}>
              Need help? <Link href="mailto:support@fonmarketing.com" style={supportLinkStyle}>support@fonmarketing.com</Link>
            </Text>
          </Section>
          <Hr style={{ display: 'none' }} />
        </Container>
      </Body>
    </Html>
  )
}

export default MagicLinkInviteEmail
