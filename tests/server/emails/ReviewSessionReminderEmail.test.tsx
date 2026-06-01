import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { ReviewSessionReminderEmail } from '@/server/emails/ReviewSessionReminderEmail'

const baseProps = {
  reviewerName: 'Caleb Cody',
  clientName: 'My DUI Guy',
  batchLabel: 'May 2026',
  amName: 'Mollie Huebner',
  reviewedCount: 6,
  totalCount: 13,
  reviewUrl: 'https://relay-app-xi.vercel.app/review/abc.123.456',
  threshold: '48h' as const,
}

describe('ReviewSessionReminderEmail', () => {
  it('renders the reviewer first name in the greeting', async () => {
    const html = await render(<ReviewSessionReminderEmail {...baseProps} />)
    // Greeting uses first token only.
    expect(html).toContain('Hey Caleb')
  })

  it('renders progress as N of M', async () => {
    const html = await render(<ReviewSessionReminderEmail {...baseProps} />)
    expect(html).toContain('6 of 13 reviewed')
  })

  it('renders the CTA URL as both a button href and a plain text fallback link', async () => {
    const html = await render(<ReviewSessionReminderEmail {...baseProps} />)
    const url = baseProps.reviewUrl
    // URL should appear at least twice: CTA button + fallback section.
    const matches = html.split(url).length - 1
    expect(matches).toBeGreaterThanOrEqual(2)
  })

  it('signs the email with the AM name', async () => {
    const html = await render(<ReviewSessionReminderEmail {...baseProps} />)
    expect(html).toContain('Mollie Huebner')
  })

  it('uses different opening copy and preview for the 96h variant', async () => {
    const html48 = await render(
      <ReviewSessionReminderEmail {...baseProps} threshold="48h" />,
    )
    const html96 = await render(
      <ReviewSessionReminderEmail {...baseProps} threshold="96h" />,
    )

    // Opener diverges.
    expect(html48).toContain('a couple days back')
    expect(html96).toContain('a few days')
    expect(html48).not.toEqual(html96)
  })

  it('falls back to "there" when the reviewer name is empty', async () => {
    const html = await render(
      <ReviewSessionReminderEmail {...baseProps} reviewerName="" />,
    )
    expect(html).toContain('Hey there')
  })

  it('produces a sane plain text fallback including the URL, progress, and signature', async () => {
    const plainText = await render(
      <ReviewSessionReminderEmail {...baseProps} />,
      { plainText: true },
    )
    expect(plainText).toContain(baseProps.reviewUrl)
    expect(plainText).toContain('Caleb')
    expect(plainText).toContain('My DUI Guy')
    expect(plainText).toContain('May 2026')
    expect(plainText).toContain('6 of 13')
    expect(plainText).toContain('Mollie Huebner')
  })
})
