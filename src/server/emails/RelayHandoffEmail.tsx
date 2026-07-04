/**
 * RelayHandoffEmail , React Email template for the "a relay was handed to
 * you" nudge. Sent to the new holder when the baton passes forward (Pass
 * Baton) or back (Send Back) to them.
 *
 * Off-happy-path notification: the holder is not always watching the app,
 * so a send back or forward hand off emails them "it's your turn". Same
 * visual language as ReviewSessionReminderEmail / MagicLinkInviteEmail so
 * the recipient recognizes the sender. Subject is owned by the caller;
 * this file only renders the body.
 *
 * Internal teammates only , client-role recipients are notified via the
 * magic-link review invite, not this email (the caller enforces the skip).
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

export interface RelayHandoffEmailProps {
  /// Full recipient (new holder) name. Greeting uses the full name.
  recipientName: string
  /// Name of the person who passed / sent it back.
  actorName: string
  /// Client display name, e.g. "My DUI Guy".
  clientName: string
  /// Display label like "May 2026".
  batchLabel: string
  /// Human step label the relay is now on, e.g. "Initial Design".
  stepLabel: string
  /// Which direction the baton moved.
  direction: 'forward' | 'back'
  /// The send-back reason. Present only for `direction: 'back'`.
  reason?: string
  /// Fully qualified URL to the relay.
  relayUrl: string
}

// Style tokens mirror ReviewSessionReminderEmail so the visual treatment
// stays consistent across the transactional thread. Inline styles are
// intentional; email clients ignore most external CSS.
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

const reasonStyle: React.CSSProperties = {
  margin: '0 0 14px',
  padding: '12px 16px',
  background: '#f7f7f6',
  borderLeft: '3px solid #d9d9d7',
  borderRadius: 8,
  fontSize: 15,
  color: '#444',
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

export function RelayHandoffEmail(
  props: RelayHandoffEmailProps,
): React.ReactElement {
  const {
    recipientName,
    actorName,
    clientName,
    batchLabel,
    stepLabel,
    direction,
    reason,
    relayUrl,
  } = props

  const greetName = greetingName(recipientName)
  const isBack = direction === 'back'

  const opener = isBack
    ? `${actorName} sent ${clientName}'s ${batchLabel} relay back for re-review. It's now with you at ${stepLabel}.`
    : `${actorName} passed ${clientName}'s ${batchLabel} relay to you. It's now at ${stepLabel} and waiting on you.`

  const preview = isBack
    ? `${clientName} ${batchLabel} sent back for re-review`
    : `${clientName} ${batchLabel} is now with you`

  const subLabel = isBack ? 'Sent back for re-review' : 'Relay handed to you'

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={headerSectionStyle}>
            <Text style={brandStyle}>Five One Nine Marketing</Text>
            <Text style={brandSubStyle}>{subLabel}</Text>
          </Section>

          <Section style={bodySectionStyle}>
            <Text style={h1Style}>{`Hey ${greetName},`}</Text>
            <Text style={paragraphStyle}>{opener}</Text>
            {isBack && reason ? (
              <Text style={reasonStyle}>{reason}</Text>
            ) : null}
            <Text style={paragraphStyle}>
              Open the relay to pick it up whenever you have a minute.
            </Text>
          </Section>

          <Section style={ctaSectionStyle}>
            <Button href={relayUrl} style={buttonStyle}>
              Open the relay
            </Button>
          </Section>

          <Section style={fallbackSectionStyle}>
            <Text style={fallbackStyle}>
              Button not working? Paste this URL into your browser:
              <br />
              <Link href={relayUrl} style={fallbackLinkStyle}>
                {relayUrl}
              </Link>
            </Text>
          </Section>

          <Section style={footerSectionStyle}>
            <Text style={{ margin: 0 }}>Reply to this email to reach {actorName} directly.</Text>
          </Section>
          <Hr style={{ display: 'none' }} />
        </Container>
      </Body>
    </Html>
  )
}

export default RelayHandoffEmail
