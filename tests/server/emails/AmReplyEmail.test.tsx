import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { AmReplyEmail, buildAmReplySubject } from '@/server/emails/AmReplyEmail'

describe('AmReplyEmail', () => {
  const props = { reviewerName: 'Dana Lee', clientName: 'Acme Co', amName: 'Morgan AM', reviewUrl: 'https://app.test/review/tok123' }

  it('renders the full reviewer name, client name, AM name, and a CTA to the review URL', async () => {
    const html = await render(<AmReplyEmail {...props} />)
    // Greeting uses the full name (not first-token shortened).
    expect(html).toContain('Hey Dana Lee,')
    expect(html).toContain('Acme Co')
    expect(html).toContain('Morgan AM')
    expect(html).toContain('https://app.test/review/tok123')
  })

  it('greets a business/multi-word reviewer name in full (no first-token shortening)', async () => {
    const html = await render(<AmReplyEmail {...props} reviewerName="Old Plank" />)
    expect(html).toContain('Hey Old Plank,')
    expect(html).not.toContain('Hey Old,')
  })

  it('falls back to "there" when the reviewer name is empty', async () => {
    const html = await render(<AmReplyEmail {...props} reviewerName="" />)
    expect(html).toContain('Hey there,')
  })

  it('buildAmReplySubject names the client', () => {
    expect(buildAmReplySubject(props)).toContain('Acme Co')
  })
})
