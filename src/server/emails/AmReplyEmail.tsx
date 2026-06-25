/**
 * AmReplyEmail — React Email template sent to a client reviewer when their
 * account manager replies to their submitted feedback.
 *
 * Single CTA links back to the live review session so the reviewer can read
 * the AM's reply and respond inline.
 *
 * Visual language mirrors ReviewSessionReminderEmail (same style token set).
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

export interface AmReplyEmailProps {
  /** Full reviewer name. Greeting uses the first token only. */
  reviewerName: string
  /** Client display name, e.g. "Acme Co". */
  clientName: string
  /** AM display name, used in the body and signoff. */
  amName: string
  /** Fully qualified URL the reviewer clicks to open the review. */
  reviewUrl: string
}

function firstName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return 'there'
  return trimmed.split(/\s+/)[0]
}

export function buildAmReplySubject(props: Pick<AmReplyEmailProps, 'clientName'>): string {
  return `New reply on your ${props.clientName} review`
}

// Style tokens mirror ReviewSessionReminderEmail for visual consistency.
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

export function AmReplyEmail({
  reviewerName,
  clientName,
  amName,
  reviewUrl,
}: AmReplyEmailProps): React.ReactElement {
  const fname = firstName(reviewerName)

  return (
    <Html>
      <Head />
      <Preview>{`${amName} replied on your ${clientName} review`}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={headerSectionStyle}>
            <Text style={brandStyle}>Five One Nine Marketing</Text>
            <Text style={brandSubStyle}>Review reply</Text>
          </Section>

          <Section style={bodySectionStyle}>
            <Text style={h1Style}>{`Hey ${fname},`}</Text>
            <Text style={paragraphStyle}>
              {`${amName} replied to your feedback on ${clientName}'s posts. Open your review to read the reply and respond.`}
            </Text>
          </Section>

          <Section style={ctaSectionStyle}>
            <Button href={reviewUrl} style={buttonStyle}>
              Open your review
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

export default AmReplyEmail
