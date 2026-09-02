/**
 * NotificationRollupEmail, React Email template for the five minute rollup
 * of in-app notifications a teammate has not read yet.
 *
 * Every line of copy is produced upstream by renderSummary/resolveHref, the
 * same functions the notification bell uses, so this file only lays out what
 * it is handed. Subject is owned by the caller.
 *
 * Internal teammates only. Client role recipients are excluded by the query.
 *
 * Style tokens mirror RelayHandoffEmail so the transactional thread looks
 * consistent. Inline styles are intentional; email clients drop most
 * external CSS.
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
import { buildRollupHeadline, type RollupEmailContent } from '@/lib/notification-email-rollup'

export interface NotificationRollupEmailProps {
  /// Full recipient name. Greeting uses the full name.
  recipientName: string
  /// Grouped, ordered, with absolute URLs for all hrefs.
  content: RollupEmailContent
  /// Fully qualified URL to the recipient's Relay inbox.
  inboxUrl: string
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
  padding: '24px 32px',
  borderBottom: '1px solid #efefee',
}

const brandStyle: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: 1,
  textTransform: 'uppercase',
  color: '#8a8a85',
  margin: 0,
}

const contentSectionStyle: React.CSSProperties = { padding: '24px 32px' }

const clientHeadingStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  color: '#8a8a85',
  margin: '20px 0 8px',
}

const itemStyle: React.CSSProperties = {
  fontSize: 15,
  margin: '0 0 10px',
  paddingLeft: 12,
  borderLeft: '2px solid #efefee',
}

const itemLinkStyle: React.CSSProperties = {
  color: '#1a1a1a',
  textDecoration: 'none',
}

const h1Style: React.CSSProperties = {
  margin: '0 0 14px',
  fontSize: 22,
  fontWeight: 600,
  letterSpacing: '-0.01em',
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

const footerStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#8a8a85',
  margin: 0,
}

export function NotificationRollupEmail({
  recipientName,
  content,
  inboxUrl,
}: NotificationRollupEmailProps) {
  const headline = buildRollupHeadline(content)

  return (
    <Html>
      <Head />
      <Preview>{headline}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={headerSectionStyle}>
            <Text style={brandStyle}>Relay</Text>
          </Section>

          <Section style={contentSectionStyle}>
            <Text style={h1Style}>Hi {greetingName(recipientName)},</Text>
            <Text style={{ fontSize: 15, margin: '0 0 8px', color: '#4a4a45' }}>
              {headline}. You have not opened these in Relay yet.
            </Text>

            {content.groups.map((group) => (
              <Section key={group.clientId}>
                <Text style={clientHeadingStyle}>{group.clientName}</Text>
                {group.items.map((item) => (
                  <Text key={item.mentionId} style={itemStyle}>
                    <Link href={item.href} style={itemLinkStyle}>
                      {item.summary}
                    </Link>
                  </Text>
                ))}
              </Section>
            ))}

            <Section style={{ marginTop: 24 }}>
              <Button href={inboxUrl} style={buttonStyle}>
                Open Relay
              </Button>
            </Section>
          </Section>

          <Hr style={{ borderColor: '#efefee', margin: 0 }} />

          <Section style={{ padding: '16px 32px 24px' }}>
            <Text style={footerStyle}>
              You are receiving this because you are on the Relay team and have
              unread notifications.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
