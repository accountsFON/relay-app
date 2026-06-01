/**
 * FeedbackDigestEmail , weekly digest of in app "Report a bug"
 * submissions, sent every Monday at 13:00 UTC (8am EST winter, 9am EDT
 * summer) by the sendFeedbackDigest cron.
 *
 * Mirrors the visual language of ReviewSessionReminderEmail so the
 * inbox treatment stays consistent across product emails. Items are
 * grouped by severity (high first), each item rendering submitter,
 * timestamp, and body text.
 *
 * The cron sets sentInDigestAt on every included row after a
 * successful send. Subject is owned by the caller; this file only
 * renders the body.
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

import type { FeedbackSeverity } from '@prisma/client'

export interface FeedbackDigestItem {
  id: string
  severity: FeedbackSeverity
  bodyText: string
  createdAt: Date
  submitterName: string
  submitterEmail: string
}

export interface FeedbackDigestEmailProps {
  /// Total items in this digest. The subject line also surfaces this so
  /// the inbox treatment matches the body.
  totalCount: number
  /// Inclusive window the digest covers. Used in the intro line so the
  /// reader can scope expectations. ISO-stringified inside the template.
  windowStart: Date
  windowEnd: Date
  /// Pre-grouped items, severity-major then chronological within group.
  /// The cron renders the same order it iterates so the database stamp
  /// + email body match.
  items: FeedbackDigestItem[]
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
  maxWidth: 620,
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
  padding: '24px 32px 8px',
}

const h1Style: React.CSSProperties = {
  margin: '0 0 12px',
  fontSize: 20,
  fontWeight: 600,
  letterSpacing: '-0.01em',
}

const introStyle: React.CSSProperties = {
  margin: '0 0 16px',
  fontSize: 15,
  color: '#444',
}

const groupHeaderStyle: React.CSSProperties = {
  marginTop: 16,
  marginBottom: 8,
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: 0.8,
  fontWeight: 600,
  color: '#666',
}

const itemBlockStyle: React.CSSProperties = {
  padding: '12px 14px',
  border: '1px solid #efefee',
  borderRadius: 10,
  marginBottom: 10,
  background: '#fafafa',
}

const itemMetaStyle: React.CSSProperties = {
  margin: '0 0 6px',
  fontSize: 12,
  color: '#777',
}

const itemBodyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  whiteSpace: 'pre-wrap',
  color: '#1a1a1a',
}

const footerSectionStyle: React.CSSProperties = {
  padding: '16px 32px 24px',
  borderTop: '1px solid #efefee',
  fontSize: 12,
  color: '#888',
}

const SEVERITY_ORDER: FeedbackSeverity[] = ['high', 'medium', 'low']

function formatDateRange(start: Date, end: Date): string {
  const fmt: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }
  return `${start.toLocaleDateString('en-US', fmt)} , ${end.toLocaleDateString('en-US', fmt)}`
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

function severityLabel(s: FeedbackSeverity): string {
  if (s === 'high') return 'High severity'
  if (s === 'medium') return 'Medium severity'
  return 'Low severity'
}

export function FeedbackDigestEmail(
  props: FeedbackDigestEmailProps,
): React.ReactElement {
  const { totalCount, windowStart, windowEnd, items } = props

  // Group by severity, preserving incoming order inside each group.
  const grouped = new Map<FeedbackSeverity, FeedbackDigestItem[]>()
  for (const sev of SEVERITY_ORDER) grouped.set(sev, [])
  for (const item of items) {
    grouped.get(item.severity)?.push(item)
  }

  const preview = `Weekly Relay feedback digest, ${totalCount} item${totalCount === 1 ? '' : 's'}`
  const intro = `${totalCount} new report${totalCount === 1 ? '' : 's'} from ${formatDateRange(windowStart, windowEnd)}.`

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={headerSectionStyle}>
            <Text style={brandStyle}>Five One Nine Marketing</Text>
            <Text style={brandSubStyle}>Relay feedback digest</Text>
          </Section>

          <Section style={bodySectionStyle}>
            <Text style={h1Style}>This week in Relay</Text>
            <Text style={introStyle}>{intro}</Text>

            {SEVERITY_ORDER.map((sev) => {
              const group = grouped.get(sev) ?? []
              if (group.length === 0) return null
              return (
                <Section key={sev}>
                  <Text style={groupHeaderStyle}>
                    {severityLabel(sev)} ({group.length})
                  </Text>
                  {group.map((item) => (
                    <Section key={item.id} style={itemBlockStyle}>
                      <Text style={itemMetaStyle}>
                        {item.submitterName} ({item.submitterEmail}) ,{' '}
                        {formatTimestamp(item.createdAt)} UTC
                      </Text>
                      <Text style={itemBodyStyle}>{item.bodyText}</Text>
                    </Section>
                  ))}
                </Section>
              )
            })}
          </Section>

          <Section style={footerSectionStyle}>
            <Text style={{ margin: 0 }}>
              Sent automatically every Monday. High severity reports also
              fire an immediate alert at submit time.
            </Text>
          </Section>
          <Hr style={{ display: 'none' }} />
        </Container>
      </Body>
    </Html>
  )
}

export default FeedbackDigestEmail
