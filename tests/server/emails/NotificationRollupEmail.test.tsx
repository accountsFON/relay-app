import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { NotificationRollupEmail } from '@/server/emails/NotificationRollupEmail'
import type { RollupEmailContent } from '@/lib/notification-email-rollup'

const content: RollupEmailContent = {
  totalCount: 3,
  clientCount: 2,
  groups: [
    {
      clientId: 'c_alpha',
      clientName: 'Alpha Co',
      items: [
        { summary: 'Mollie replied on Post 3', href: 'https://x.test/a1', createdAt: new Date() },
        { summary: 'Mollie resolved the thread on Post 3', href: 'https://x.test/a2', createdAt: new Date() },
      ],
    },
    {
      clientId: 'c_beta',
      clientName: 'Beta Co',
      items: [
        { summary: 'Caleb opened a thread on Post 1', href: 'https://x.test/b1', createdAt: new Date() },
      ],
    },
  ],
}

describe('NotificationRollupEmail', () => {
  it('renders every client heading and every item summary', async () => {
    const html = await render(
      <NotificationRollupEmail
        recipientName="Julio Aleman"
        content={content}
        inboxUrl="https://x.test/inbox"
      />,
    )

    expect(html).toContain('Alpha Co')
    expect(html).toContain('Beta Co')
    expect(html).toContain('Mollie replied on Post 3')
    expect(html).toContain('Mollie resolved the thread on Post 3')
    expect(html).toContain('Caleb opened a thread on Post 1')
  })

  it('links each item to its deep link', async () => {
    const html = await render(
      <NotificationRollupEmail
        recipientName="Julio Aleman"
        content={content}
        inboxUrl="https://x.test/inbox"
      />,
    )

    expect(html).toContain('https://x.test/a1')
    expect(html).toContain('https://x.test/a2')
    expect(html).toContain('https://x.test/b1')
    expect(html).toContain('https://x.test/inbox')
  })

  it('renders a plain text alternative carrying the same summaries', async () => {
    const text = await render(
      <NotificationRollupEmail
        recipientName="Julio Aleman"
        content={content}
        inboxUrl="https://x.test/inbox"
      />,
      { plainText: true },
    )

    expect(text).toContain('Mollie replied on Post 3')
    expect(text).toContain('Caleb opened a thread on Post 1')
  })
})
