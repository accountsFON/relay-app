/**
 * Render tests for FeedbackUrgentEmail (Phase 5 item 27).
 */
import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { FeedbackUrgentEmail } from '@/server/emails/FeedbackUrgentEmail'

const baseProps = {
  submitterName: 'Julio Aleman',
  submitterEmail: 'julio@fonmarketing.com',
  bodyText: 'Tap Submit on /clients and the page goes blank.',
  submittedAt: new Date('2026-06-01T12:34:00Z'),
}

describe('FeedbackUrgentEmail', () => {
  it('renders the urgent severity badge in the header', async () => {
    const html = await render(<FeedbackUrgentEmail {...baseProps} />)
    expect(html).toContain('URGENT')
    expect(html).toContain('high severity')
  })

  it('renders the submitter name in the headline', async () => {
    const html = await render(<FeedbackUrgentEmail {...baseProps} />)
    expect(html).toContain('Julio Aleman flagged something')
  })

  it('renders the body text verbatim', async () => {
    const html = await render(<FeedbackUrgentEmail {...baseProps} />)
    expect(html).toContain('Tap Submit on /clients')
  })

  it('renders the submitter email so reply path is obvious', async () => {
    const html = await render(<FeedbackUrgentEmail {...baseProps} />)
    expect(html).toContain('julio@fonmarketing.com')
  })

  it('renders the plain text fallback with body + submitter name', async () => {
    const plainText = await render(
      <FeedbackUrgentEmail {...baseProps} />,
      { plainText: true },
    )
    expect(plainText).toContain('Julio Aleman')
    expect(plainText).toContain('Tap Submit on /clients')
  })
})
