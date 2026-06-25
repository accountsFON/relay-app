import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { AmReplyEmail, buildAmReplySubject } from '@/server/emails/AmReplyEmail'

describe('AmReplyEmail', () => {
  const props = { reviewerName: 'Dana Lee', clientName: 'Acme Co', amName: 'Morgan AM', reviewUrl: 'https://app.test/review/tok123' }

  it('renders the reviewer first name, client name, AM name, and a CTA to the review URL', async () => {
    const html = await render(<AmReplyEmail {...props} />)
    expect(html).toContain('Dana')
    expect(html).toContain('Acme Co')
    expect(html).toContain('Morgan AM')
    expect(html).toContain('https://app.test/review/tok123')
  })

  it('buildAmReplySubject names the client', () => {
    expect(buildAmReplySubject(props)).toContain('Acme Co')
  })
})
