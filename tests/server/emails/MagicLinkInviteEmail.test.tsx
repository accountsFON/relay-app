import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { MagicLinkInviteEmail } from '@/server/emails/MagicLinkInviteEmail'

const baseProps = {
  recipientName: 'Sarah Smith',
  clientName: 'My DUI Guy',
  monthLabel: 'May 2026',
  reviewUrl: 'https://relay-app-xi.vercel.app/review/test-token-abc123',
  senderName: 'Mollie Huebner',
  // Use a UTC date that won't shift across timezones in formatExpiry.
  expiresAt: new Date(Date.UTC(2026, 4, 31, 12, 0, 0)),
}

describe('MagicLinkInviteEmail', () => {
  it('renders all dynamic fields in the output HTML', async () => {
    const html = await render(<MagicLinkInviteEmail {...baseProps} />)

    // Greeting uses the full recipient name (not first-token shortened).
    expect(html).toContain('Hi Sarah Smith,')
    // Client name appears as the h1
    expect(html).toContain('My DUI Guy')
    // Month label appears in subtitle + body copy
    expect(html).toContain('May 2026')
    // Expiry rendered via formatExpiry , "May 31, 2026"
    expect(html).toContain('May 31, 2026')
    // Sender name in the signature footer
    expect(html).toContain('Mollie Huebner')
  })

  it('greets a business/multi-word recipient name in full (no first-token shortening)', async () => {
    const html = await render(
      <MagicLinkInviteEmail {...baseProps} recipientName="Old Plank" />,
    )
    expect(html).toContain('Hi Old Plank,')
    expect(html).not.toContain('Hi Old,')
  })

  it('falls back to "there" when the recipient name is empty', async () => {
    const html = await render(
      <MagicLinkInviteEmail {...baseProps} recipientName="" />,
    )
    expect(html).toContain('Hi there,')
  })

  it('renders the CTA URL as both a button href and a plain-text fallback link', async () => {
    const html = await render(<MagicLinkInviteEmail {...baseProps} />)
    const url = baseProps.reviewUrl

    // The URL should appear at least twice: once on the button anchor,
    // once in the "paste this URL into your browser" fallback section.
    const matches = html.split(url).length - 1
    expect(matches).toBeGreaterThanOrEqual(2)

    // The fallback section should also include the URL as visible text,
    // not just as an href value.
    expect(html).toContain('Paste this URL into your browser')
  })

  it('produces a sane plain-text fallback that includes the review URL and signature', async () => {
    const plainText = await render(<MagicLinkInviteEmail {...baseProps} />, {
      plainText: true,
    })

    // Plain text should include the URL exactly once or more (button + fallback collapse).
    expect(plainText).toContain(baseProps.reviewUrl)
    // Greeting + key dynamic fields survive the plain text conversion.
    expect(plainText).toContain('Sarah')
    expect(plainText).toContain('My DUI Guy')
    expect(plainText).toContain('May 2026')
    expect(plainText).toContain('Mollie Huebner')
    // Expiry copy survives
    expect(plainText).toContain('May 31, 2026')
  })
})
