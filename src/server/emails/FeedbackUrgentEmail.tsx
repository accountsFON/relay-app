/**
 * FeedbackUrgentEmail , fires immediately at submit time when a user
 * picks severity = high on the in app "Report a bug" form.
 *
 * Separate template from the weekly digest because the inbox treatment
 * needs to be obviously different (subject prefix [URGENT], prominent
 * severity tag, single item body). Sent via the same Resend wrapper as
 * everything else; subject + reply-to set by the caller.
 *
 * Spec: projects/relay-app/2026-06-01-phase-5-item-27-feedback-channel-recommendation.md
 */
import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

export interface FeedbackUrgentEmailProps {
  submitterName: string
  submitterEmail: string
  bodyText: string
  submittedAt: Date
}

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
  padding: '20px 28px',
  borderBottom: '1px solid #efefee',
  background: '#fff6f5',
}

const brandStyle: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: 1,
  textTransform: 'uppercase',
  color: '#b3261e',
  margin: 0,
  fontWeight: 700,
}

const brandSubStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#b3261e',
  marginTop: 4,
  marginBottom: 0,
}

const bodySectionStyle: React.CSSProperties = {
  padding: '24px 28px 8px',
}

const h1Style: React.CSSProperties = {
  margin: '0 0 12px',
  fontSize: 20,
  fontWeight: 600,
  letterSpacing: '-0.01em',
}

const metaStyle: React.CSSProperties = {
  margin: '0 0 16px',
  fontSize: 13,
  color: '#666',
}

const reportBlockStyle: React.CSSProperties = {
  padding: '14px 16px',
  border: '1px solid #efefee',
  borderRadius: 10,
  background: '#fafafa',
  marginBottom: 8,
}

const reportBodyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 15,
  whiteSpace: 'pre-wrap',
  color: '#1a1a1a',
}

const footerSectionStyle: React.CSSProperties = {
  padding: '16px 28px 24px',
  borderTop: '1px solid #efefee',
  fontSize: 12,
  color: '#888',
}

function formatTimestamp(d: Date): string {
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  })
}

export function FeedbackUrgentEmail(
  props: FeedbackUrgentEmailProps,
): React.ReactElement {
  const { submitterName, submitterEmail, bodyText, submittedAt } = props

  const preview = `URGENT: bug report from ${submitterName}`

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={headerSectionStyle}>
            <Text style={brandStyle}>URGENT , high severity</Text>
            <Text style={brandSubStyle}>Relay bug report</Text>
          </Section>

          <Section style={bodySectionStyle}>
            <Text style={h1Style}>{`${submitterName} flagged something`}</Text>
            <Text style={metaStyle}>
              {submitterEmail} , {formatTimestamp(submittedAt)} UTC
            </Text>
            <Section style={reportBlockStyle}>
              <Text style={reportBodyStyle}>{bodyText}</Text>
            </Section>
          </Section>

          <Section style={footerSectionStyle}>
            <Text style={{ margin: 0 }}>
              This was sent immediately because the reporter chose
              severity = high. The same report will also appear in
              Monday&apos;s weekly digest.
            </Text>
          </Section>
          <Hr style={{ display: 'none' }} />
        </Container>
      </Body>
    </Html>
  )
}

export default FeedbackUrgentEmail
